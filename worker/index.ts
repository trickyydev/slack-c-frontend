import { DurableObject } from 'cloudflare:workers'

type FileUploadStrategy = 'direct' | 'multipart'
type CarePackageStatus =
  | 'initiated'
  | 'uploading'
  | 'completed'
  | 'cancelled'
  | 'expired'
  | 'failed'
type FileStatus = 'pending' | 'uploading' | 'completed' | 'cancelled' | 'failed'

type JsonRecord = Record<string, unknown>

interface AppConfig {
  bucketCapBytes: number
  publicHourlyCapBytes: number
  publicPackageCapBytes: number
  uploadSessionTtlMinutes: number
  multipartChunkSizeBytes: number
  directUploadMaxBytes: number
  headerSnapshotMaxBytes: number
  maxFilesPerCarePackage: number
  turnstileRequired: boolean
  turnstileSiteKey: string | null
}

interface CreateSessionBody {
  turnstileToken?: unknown
  uploadCode?: unknown
  senderName?: unknown
  comment?: unknown
  files?: unknown
}

interface FileManifestInput {
  relativePath: string
  sizeBytes: number
  contentType: string | null
  lastModified: number | null
}

interface CarePackageRow {
  id: string
  status: CarePackageStatus
  sender_name: string | null
  comment: string | null
  upload_code_id: string | null
  quota_mode: string
  declared_bytes: number
  committed_bytes: number
  reserved_bytes: number
  file_count: number
  created_at: string
  updated_at: string
  completed_at: string | null
  expires_at: string
  ip_address: string | null
  user_agent: string | null
  request_headers_json: string | null
  request_cf_json: string | null
}

interface CarePackageFileRow {
  id: string
  care_package_id: string
  relative_path: string
  file_name: string
  object_key: string
  size_bytes: number
  content_type: string | null
  last_modified: number | null
  upload_strategy: FileUploadStrategy
  status: FileStatus
  upload_id: string | null
  part_size_bytes: number | null
  uploaded_parts_json: string
  uploaded_bytes: number
  completed_parts: number
  etag: string | null
  created_at: string
  updated_at: string
  completed_at: string | null
}

interface UploadCodeRow {
  id: string
  code_hash: string
  label: string | null
  status: string
  notes: string | null
  bypass_public_hourly_cap: number
  bypass_public_package_cap: number
  created_at: string
  expires_at: string
  last_used_at: string | null
}

interface AdminSessionClaims {
  scope: 'admin'
  iat: number
  exp: number
}

interface AdminLoginBody {
  password?: unknown
}

interface UploadedPartRecord {
  partNumber: number
  etag: string
  sizeBytes: number
}

interface ReservationEntry {
  bytes: number
  bypassHourlyCap: boolean
  createdAtMs: number
  expiresAtMs: number
}

interface CommitEntry {
  bytes: number
  committedAtMs: number
}

interface QuotaRequestPayload {
  kind: 'reserve' | 'commit' | 'release' | 'status'
  sessionId?: string
  bytes?: number
  actualBytes?: number
  bypassHourlyCap?: boolean
  expiresAtMs?: number
  nowMs: number
  bucketCapBytes: number
  publicHourlyCapBytes: number
}

interface QuotaResponse {
  ok: boolean
  reason?: string
  activeReservedBytes: number
  committedBytes: number
  bucketUsedBytes: number
  publicHourlyBytes: number
  reservationExists?: boolean
}

type RuntimeEnv = Env & {
  ADMIN_PASSWORD?: string
  ADMIN_SESSION_SECRET?: string
  ADMIN_SESSION_TTL_HOURS?: string
  LOCAL_TURNSTILE_BYPASS?: string
  TURNSTILE_SECRET_KEY?: string
  UPLOAD_CODE_HASH_SALT?: string
}

const FIVE_MIB = 5 * 1024 * 1024
const ONE_HOUR_MS = 60 * 60 * 1000
const ADMIN_SESSION_COOKIE = 'slack_classics_admin_session'

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url)
    const localTurnstileBypass = isLocalTurnstileBypassEnabled(request, env)

    if (!url.pathname.startsWith('/api/')) {
      return new Response('Not found', { status: 404 })
    }

    const config = getConfig(env)
    const path = url.pathname.split('/').filter(Boolean)

    if (request.method === 'GET' && url.pathname === '/api/health') {
      return jsonResponse({
        ok: true,
        service: 'care-package-inbox',
        timestamp: new Date().toISOString(),
      })
    }

    if (request.method === 'GET' && url.pathname === '/api/public-config') {
      return jsonResponse({
        path: '/inbox',
        supportsFolderUpload: true,
        supportsUploadCodes: true,
        turnstileRequired: localTurnstileBypass ? false : config.turnstileRequired,
        turnstileSiteKey: localTurnstileBypass ? null : config.turnstileSiteKey,
        limits: {
          bucketCapBytes: config.bucketCapBytes,
          publicHourlyCapBytes: config.publicHourlyCapBytes,
          publicPackageCapBytes: config.publicPackageCapBytes,
          multipartChunkSizeBytes: config.multipartChunkSizeBytes,
          directUploadMaxBytes: config.directUploadMaxBytes,
          maxFilesPerCarePackage: config.maxFilesPerCarePackage,
        },
      })
    }

    if (request.method === 'POST' && path.length === 3 && matches(path, 'api', 'admin', 'session')) {
      return createAdminSession(request, env)
    }

    if (request.method === 'GET' && path.length === 3 && matches(path, 'api', 'admin', 'session')) {
      return getAdminSession(request, env)
    }

    if (request.method === 'POST' && path.length === 3 && matches(path, 'api', 'admin', 'logout')) {
      return clearAdminSession(request)
    }

    if (request.method === 'GET' && path.length === 3 && matches(path, 'api', 'admin', 'care-packages')) {
      return listAdminCarePackages(request, env)
    }

    if (request.method === 'POST' && path.length === 3 && matches(path, 'api', 'inbox', 'sessions')) {
      return createUploadSession(request, env, config)
    }

    if (
      request.method === 'GET' &&
      path.length === 4 &&
      path[0] === 'api' &&
      path[1] === 'inbox' &&
      path[2] === 'sessions'
    ) {
      return getUploadSession(env, path[3])
    }

    if (
      request.method === 'POST' &&
      path.length === 7 &&
      path[0] === 'api' &&
      path[1] === 'inbox' &&
      path[2] === 'sessions' &&
      path[4] === 'files' &&
      path[6] === 'start'
    ) {
      return startFileUpload(env, path[3], path[5], config)
    }

    if (
      request.method === 'PUT' &&
      path.length === 6 &&
      path[0] === 'api' &&
      path[1] === 'inbox' &&
      path[2] === 'sessions' &&
      path[4] === 'files'
    ) {
      return uploadDirectFile(request, env, path[3], path[5], config)
    }

    if (
      request.method === 'PUT' &&
      path.length === 8 &&
      path[0] === 'api' &&
      path[1] === 'inbox' &&
      path[2] === 'sessions' &&
      path[4] === 'files' &&
      path[6] === 'parts'
    ) {
      const partNumber = Number(path[7])
      return uploadMultipartPart(request, env, path[3], path[5], partNumber)
    }

    if (
      request.method === 'POST' &&
      path.length === 7 &&
      path[0] === 'api' &&
      path[1] === 'inbox' &&
      path[2] === 'sessions' &&
      path[4] === 'files' &&
      path[6] === 'complete'
    ) {
      return completeFileUpload(env, path[3], path[5])
    }

    if (
      request.method === 'POST' &&
      path.length === 5 &&
      path[0] === 'api' &&
      path[1] === 'inbox' &&
      path[2] === 'sessions' &&
      path[4] === 'complete'
    ) {
      return completeUploadSession(env, path[3], config)
    }

    if (
      request.method === 'POST' &&
      path.length === 5 &&
      path[0] === 'api' &&
      path[1] === 'inbox' &&
      path[2] === 'sessions' &&
      path[4] === 'cancel'
    ) {
      return cancelUploadSession(env, path[3], config)
    }

    return errorResponse(404, 'not_found', 'Route not found.')
  },
} satisfies ExportedHandler<RuntimeEnv>

export class QuotaCoordinator extends DurableObject<RuntimeEnv> {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return errorResponse(405, 'method_not_allowed', 'Use POST for quota operations.')
    }

    const payload = (await request.json()) as QuotaRequestPayload
    const nowMs = payload.nowMs
    const reservations = await this.loadReservations()
    const commits = await this.loadCommits()
    const hourlyEvents = await this.loadHourlyEvents()

    const activeReservations = pruneReservations(reservations, nowMs)
    const recentEvents = hourlyEvents.filter((entry) => nowMs - entry.createdAtMs < ONE_HOUR_MS)
    const committedBytes = (await this.ctx.storage.get<number>('committedBytes')) ?? 0

    if (payload.kind === 'reserve') {
      const sessionId = payload.sessionId
      const bytes = payload.bytes
      const bypassHourlyCap = Boolean(payload.bypassHourlyCap)
      const expiresAtMs = payload.expiresAtMs

      if (!sessionId || !bytes || !expiresAtMs) {
        return jsonResponse(
          {
            ok: false,
            reason: 'invalid_quota_request',
            activeReservedBytes: sumReservationBytes(activeReservations),
            committedBytes,
            bucketUsedBytes: committedBytes + sumReservationBytes(activeReservations),
            publicHourlyBytes: sumHourlyBytes(recentEvents),
          },
          400,
        )
      }

      if (commits[sessionId]) {
        return jsonResponse({
          ok: true,
          reservationExists: false,
          activeReservedBytes: sumReservationBytes(activeReservations),
          committedBytes,
          bucketUsedBytes: committedBytes + sumReservationBytes(activeReservations),
          publicHourlyBytes: sumHourlyBytes(recentEvents),
        })
      }

      if (activeReservations[sessionId]) {
        return jsonResponse({
          ok: true,
          reservationExists: true,
          activeReservedBytes: sumReservationBytes(activeReservations),
          committedBytes,
          bucketUsedBytes: committedBytes + sumReservationBytes(activeReservations),
          publicHourlyBytes: sumHourlyBytes(recentEvents),
        })
      }

      const nextReservedBytes = sumReservationBytes(activeReservations) + bytes
      if (committedBytes + nextReservedBytes > payload.bucketCapBytes) {
        await this.persistQuotaState(activeReservations, commits, recentEvents, committedBytes)
        return jsonResponse(
          {
            ok: false,
            reason: 'bucket_cap_exceeded',
            activeReservedBytes: sumReservationBytes(activeReservations),
            committedBytes,
            bucketUsedBytes: committedBytes + sumReservationBytes(activeReservations),
            publicHourlyBytes: sumHourlyBytes(recentEvents),
          },
          409,
        )
      }

      const publicHourlyBytes = sumHourlyBytes(recentEvents)
      if (!bypassHourlyCap && publicHourlyBytes + bytes > payload.publicHourlyCapBytes) {
        await this.persistQuotaState(activeReservations, commits, recentEvents, committedBytes)
        return jsonResponse(
          {
            ok: false,
            reason: 'public_hourly_cap_exceeded',
            activeReservedBytes: sumReservationBytes(activeReservations),
            committedBytes,
            bucketUsedBytes: committedBytes + sumReservationBytes(activeReservations),
            publicHourlyBytes,
          },
          429,
        )
      }

      activeReservations[sessionId] = {
        bytes,
        bypassHourlyCap,
        createdAtMs: nowMs,
        expiresAtMs,
      }
      recentEvents.push({
        bytes,
        bypassHourlyCap,
        createdAtMs: nowMs,
      })

      await this.persistQuotaState(activeReservations, commits, recentEvents, committedBytes)

      return jsonResponse({
        ok: true,
        reservationExists: true,
        activeReservedBytes: sumReservationBytes(activeReservations),
        committedBytes,
        bucketUsedBytes: committedBytes + sumReservationBytes(activeReservations),
        publicHourlyBytes: sumHourlyBytes(recentEvents),
      })
    }

    if (payload.kind === 'commit') {
      const sessionId = payload.sessionId
      const actualBytes = payload.actualBytes

      if (!sessionId || typeof actualBytes !== 'number') {
        return jsonResponse(
          {
            ok: false,
            reason: 'invalid_quota_request',
            activeReservedBytes: sumReservationBytes(activeReservations),
            committedBytes,
            bucketUsedBytes: committedBytes + sumReservationBytes(activeReservations),
            publicHourlyBytes: sumHourlyBytes(recentEvents),
          },
          400,
        )
      }

      if (commits[sessionId]) {
        return jsonResponse({
          ok: true,
          activeReservedBytes: sumReservationBytes(activeReservations),
          committedBytes,
          bucketUsedBytes: committedBytes + sumReservationBytes(activeReservations),
          publicHourlyBytes: sumHourlyBytes(recentEvents),
        })
      }

      const reservation = activeReservations[sessionId]
      if (!reservation) {
        return jsonResponse(
          {
            ok: false,
            reason: 'missing_reservation',
            activeReservedBytes: sumReservationBytes(activeReservations),
            committedBytes,
            bucketUsedBytes: committedBytes + sumReservationBytes(activeReservations),
            publicHourlyBytes: sumHourlyBytes(recentEvents),
          },
          409,
        )
      }

      if (actualBytes > reservation.bytes) {
        return jsonResponse(
          {
            ok: false,
            reason: 'actual_bytes_exceed_reservation',
            activeReservedBytes: sumReservationBytes(activeReservations),
            committedBytes,
            bucketUsedBytes: committedBytes + sumReservationBytes(activeReservations),
            publicHourlyBytes: sumHourlyBytes(recentEvents),
          },
          409,
        )
      }

      delete activeReservations[sessionId]
      const nextCommittedBytes = committedBytes + actualBytes
      commits[sessionId] = {
        bytes: actualBytes,
        committedAtMs: nowMs,
      }

      await this.persistQuotaState(activeReservations, commits, recentEvents, nextCommittedBytes)

      return jsonResponse({
        ok: true,
        activeReservedBytes: sumReservationBytes(activeReservations),
        committedBytes: nextCommittedBytes,
        bucketUsedBytes: nextCommittedBytes + sumReservationBytes(activeReservations),
        publicHourlyBytes: sumHourlyBytes(recentEvents),
      })
    }

    if (payload.kind === 'release') {
      const sessionId = payload.sessionId
      if (!sessionId) {
        return jsonResponse(
          {
            ok: false,
            reason: 'invalid_quota_request',
            activeReservedBytes: sumReservationBytes(activeReservations),
            committedBytes,
            bucketUsedBytes: committedBytes + sumReservationBytes(activeReservations),
            publicHourlyBytes: sumHourlyBytes(recentEvents),
          },
          400,
        )
      }

      delete activeReservations[sessionId]
      await this.persistQuotaState(activeReservations, commits, recentEvents, committedBytes)

      return jsonResponse({
        ok: true,
        activeReservedBytes: sumReservationBytes(activeReservations),
        committedBytes,
        bucketUsedBytes: committedBytes + sumReservationBytes(activeReservations),
        publicHourlyBytes: sumHourlyBytes(recentEvents),
      })
    }

    await this.persistQuotaState(activeReservations, commits, recentEvents, committedBytes)

    return jsonResponse({
      ok: true,
      activeReservedBytes: sumReservationBytes(activeReservations),
      committedBytes,
      bucketUsedBytes: committedBytes + sumReservationBytes(activeReservations),
      publicHourlyBytes: sumHourlyBytes(recentEvents),
    })
  }

  private async loadReservations(): Promise<Record<string, ReservationEntry>> {
    return (await this.ctx.storage.get<Record<string, ReservationEntry>>('reservations')) ?? {}
  }

  private async loadCommits(): Promise<Record<string, CommitEntry>> {
    return (await this.ctx.storage.get<Record<string, CommitEntry>>('commits')) ?? {}
  }

  private async loadHourlyEvents(): Promise<
    Array<{ bytes: number; bypassHourlyCap: boolean; createdAtMs: number }>
  > {
    return (
      (await this.ctx.storage.get<
        Array<{ bytes: number; bypassHourlyCap: boolean; createdAtMs: number }>
      >('hourlyEvents')) ?? []
    )
  }

  private async persistQuotaState(
    reservations: Record<string, ReservationEntry>,
    commits: Record<string, CommitEntry>,
    hourlyEvents: Array<{ bytes: number; bypassHourlyCap: boolean; createdAtMs: number }>,
    committedBytes: number,
  ): Promise<void> {
    await this.ctx.storage.put('reservations', reservations)
    await this.ctx.storage.put('commits', commits)
    await this.ctx.storage.put('hourlyEvents', hourlyEvents)
    await this.ctx.storage.put('committedBytes', committedBytes)
  }
}

async function createUploadSession(
  request: Request,
  env: RuntimeEnv,
  config: AppConfig,
): Promise<Response> {
  const body = (await readJson<CreateSessionBody>(request)) ?? {}
  const files = normalizeFiles(body.files, config.maxFilesPerCarePackage)
  if (!files.ok) {
    return errorResponse(400, 'invalid_files', files.message)
  }

  const senderName = normalizeText(body.senderName, 120)
  const comment = normalizeText(body.comment, 2_000)
  const turnstileToken = normalizeText(body.turnstileToken, 4_096)
  const uploadCodeText = normalizeText(body.uploadCode, 256)
  const declaredBytes = files.value.reduce((sum, file) => sum + file.sizeBytes, 0)

  if (declaredBytes <= 0) {
    return errorResponse(400, 'empty_upload', 'At least one non-empty file is required.')
  }

  const uploadCode = uploadCodeText
    ? await findActiveUploadCode(env, uploadCodeText)
    : null

  if (uploadCodeText && !uploadCode) {
    return errorResponse(403, 'invalid_upload_code', 'Upload code is invalid or expired.')
  }

  if (!uploadCode && declaredBytes > config.publicPackageCapBytes) {
    return errorResponse(
      413,
      'public_package_cap_exceeded',
      'This care package exceeds the anonymous package size limit.',
      { maxBytes: config.publicPackageCapBytes },
    )
  }

  const turnstileResult = await validateTurnstile(request, env, config, turnstileToken)
  if (!turnstileResult.ok) {
    return errorResponse(403, 'turnstile_failed', 'Turnstile verification failed.', {
      errors: turnstileResult.errors,
    })
  }

  const carePackageId = createId('cp')
  const now = new Date()
  const expiresAt = new Date(
    now.getTime() + config.uploadSessionTtlMinutes * 60 * 1000,
  ).toISOString()
  const nowIso = now.toISOString()
  const quota = await sendQuotaRequest(env, config, {
    kind: 'reserve',
    sessionId: carePackageId,
    bytes: declaredBytes,
    bypassHourlyCap: Boolean(uploadCode?.bypass_public_hourly_cap),
    expiresAtMs: new Date(expiresAt).getTime(),
  })

  if (!quota.ok) {
    return errorResponse(
      quota.reason === 'public_hourly_cap_exceeded' ? 429 : 409,
      quota.reason ?? 'quota_rejected',
      readableQuotaMessage(quota.reason),
      quota,
    )
  }

  const requestHeadersJson = snapshotHeaders(request, config.headerSnapshotMaxBytes)
  const requestCfJson = JSON.stringify(request.cf ?? {})
  const ipAddress = request.headers.get('CF-Connecting-IP')
  const userAgent = request.headers.get('User-Agent')
  const quotaMode = uploadCode ? 'upload_code' : 'public'

  const fileRows = files.value.map((file) => {
    const id = createId('file')
    const uploadStrategy: FileUploadStrategy =
      file.sizeBytes <= config.directUploadMaxBytes ? 'direct' : 'multipart'
    return {
      id,
      carePackageId,
      relativePath: file.relativePath,
      fileName: basename(file.relativePath),
      objectKey: `care-packages/${carePackageId}/${file.relativePath}`,
      sizeBytes: file.sizeBytes,
      contentType: file.contentType,
      lastModified: file.lastModified,
      uploadStrategy,
      status: 'pending' as FileStatus,
      partSizeBytes: uploadStrategy === 'multipart' ? config.multipartChunkSizeBytes : null,
      createdAt: nowIso,
      updatedAt: nowIso,
    }
  })

  try {
    await env.DB.prepare(
      `
        INSERT INTO care_packages (
          id,
          status,
          sender_name,
          comment,
          upload_code_id,
          quota_mode,
          declared_bytes,
          committed_bytes,
          reserved_bytes,
          file_count,
          created_at,
          updated_at,
          expires_at,
          ip_address,
          user_agent,
          request_headers_json,
          request_cf_json
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
      .bind(
        carePackageId,
        'initiated',
        senderName,
        comment,
        uploadCode?.id ?? null,
        quotaMode,
        declaredBytes,
        0,
        declaredBytes,
        fileRows.length,
        nowIso,
        nowIso,
        expiresAt,
        ipAddress,
        userAgent,
        requestHeadersJson,
        requestCfJson,
      )
      .run()

    await env.DB.batch(
      fileRows.map((file) =>
        env.DB.prepare(
          `
            INSERT INTO care_package_files (
              id,
              care_package_id,
              relative_path,
              file_name,
              object_key,
              size_bytes,
              content_type,
              last_modified,
              upload_strategy,
              status,
              part_size_bytes,
              created_at,
              updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
        ).bind(
          file.id,
          file.carePackageId,
          file.relativePath,
          file.fileName,
          file.objectKey,
          file.sizeBytes,
          file.contentType,
          file.lastModified,
          file.uploadStrategy,
          file.status,
          file.partSizeBytes,
          file.createdAt,
          file.updatedAt,
        ),
      ),
    )

    if (uploadCode) {
      await env.DB.prepare(
        `UPDATE upload_codes SET last_used_at = ? WHERE id = ?`,
      )
        .bind(nowIso, uploadCode.id)
        .run()
    }
  } catch (error) {
    await sendQuotaRequest(env, config, {
      kind: 'release',
      sessionId: carePackageId,
    })

    return errorResponse(500, 'session_creation_failed', 'Unable to create upload session.', {
      cause: String(error),
    })
  }

  return jsonResponse(
    {
      carePackage: {
        id: carePackageId,
        status: 'initiated',
        senderName,
        comment,
        quotaMode,
        declaredBytes,
        reservedBytes: declaredBytes,
        fileCount: fileRows.length,
        expiresAt,
      },
      files: fileRows.map((file) => ({
        id: file.id,
        relativePath: file.relativePath,
        fileName: file.fileName,
        objectKey: file.objectKey,
        sizeBytes: file.sizeBytes,
        uploadStrategy: file.uploadStrategy,
        partSizeBytes: file.partSizeBytes,
        status: file.status,
      })),
      quota: {
        activeReservedBytes: quota.activeReservedBytes,
        bucketUsedBytes: quota.bucketUsedBytes,
        publicHourlyBytes: quota.publicHourlyBytes,
      },
    },
    201,
  )
}

async function getUploadSession(env: RuntimeEnv, carePackageId: string): Promise<Response> {
  const carePackage = await getCarePackage(env, carePackageId)
  if (!carePackage) {
    return errorResponse(404, 'session_not_found', 'Upload session not found.')
  }

  const files = await listCarePackageFiles(env, carePackageId)
  return jsonResponse(serializeCarePackage(carePackage, files))
}

async function startFileUpload(
  env: RuntimeEnv,
  carePackageId: string,
  fileId: string,
  config: AppConfig,
): Promise<Response> {
  const carePackage = await getCarePackage(env, carePackageId)
  if (!carePackage) {
    return errorResponse(404, 'session_not_found', 'Upload session not found.')
  }

  if (isExpired(carePackage.expires_at)) {
    return errorResponse(410, 'session_expired', 'Upload session has expired.')
  }

  const file = await getCarePackageFile(env, carePackageId, fileId)
  if (!file) {
    return errorResponse(404, 'file_not_found', 'File record not found.')
  }

  if (file.upload_strategy === 'direct') {
    return jsonResponse({
      fileId: file.id,
      uploadStrategy: 'direct',
      directUploadMaxBytes: config.directUploadMaxBytes,
    })
  }

  if (file.upload_id) {
    return jsonResponse({
      fileId: file.id,
      uploadStrategy: 'multipart',
      uploadId: file.upload_id,
      partSizeBytes: file.part_size_bytes,
      uploadedParts: parseUploadedParts(file.uploaded_parts_json),
    })
  }

  const multipart = await env.UPLOADS_BUCKET.createMultipartUpload(file.object_key)
  const nowIso = new Date().toISOString()

  await env.DB.prepare(
    `
      UPDATE care_package_files
      SET upload_id = ?, status = ?, updated_at = ?
      WHERE id = ? AND care_package_id = ?
    `,
  )
    .bind(multipart.uploadId, 'uploading', nowIso, file.id, carePackageId)
    .run()

  await bumpCarePackageStatus(env, carePackageId)

  return jsonResponse({
    fileId: file.id,
    uploadStrategy: 'multipart',
    uploadId: multipart.uploadId,
    partSizeBytes: file.part_size_bytes,
    uploadedParts: [],
  })
}

async function uploadDirectFile(
  request: Request,
  env: RuntimeEnv,
  carePackageId: string,
  fileId: string,
  config: AppConfig,
): Promise<Response> {
  const carePackage = await getCarePackage(env, carePackageId)
  if (!carePackage) {
    return errorResponse(404, 'session_not_found', 'Upload session not found.')
  }

  if (isExpired(carePackage.expires_at)) {
    return errorResponse(410, 'session_expired', 'Upload session has expired.')
  }

  const file = await getCarePackageFile(env, carePackageId, fileId)
  if (!file) {
    return errorResponse(404, 'file_not_found', 'File record not found.')
  }

  if (file.upload_strategy !== 'direct') {
    return errorResponse(409, 'wrong_upload_strategy', 'This file must be uploaded as multipart.')
  }

  if (file.status === 'completed') {
    return jsonResponse({
      fileId: file.id,
      status: file.status,
      uploadedBytes: file.uploaded_bytes,
      etag: file.etag,
    })
  }

  const contentLength = Number(request.headers.get('content-length') ?? '0')
  if (!Number.isFinite(contentLength) || contentLength <= 0) {
    return errorResponse(411, 'missing_content_length', 'Direct uploads require a content-length header.')
  }

  if (contentLength !== file.size_bytes) {
    return errorResponse(409, 'direct_size_mismatch', 'Uploaded file size did not match the manifest.', {
      expectedBytes: file.size_bytes,
      receivedBytes: contentLength,
    })
  }

  if (contentLength > config.directUploadMaxBytes) {
    return errorResponse(413, 'direct_upload_too_large', 'This file must use multipart upload.')
  }

  const body = await request.arrayBuffer()
  await env.UPLOADS_BUCKET.put(file.object_key, body, {
    httpMetadata: {
      contentType: request.headers.get('content-type') ?? file.content_type ?? undefined,
    },
  })

  const nowIso = new Date().toISOString()
  await env.DB.prepare(
    `
      UPDATE care_package_files
      SET
        status = ?,
        uploaded_bytes = ?,
        completed_parts = 1,
        etag = ?,
        updated_at = ?,
        completed_at = ?
      WHERE id = ? AND care_package_id = ?
    `,
  )
    .bind('completed', file.size_bytes, 'direct-upload', nowIso, nowIso, file.id, carePackageId)
    .run()

  await bumpCarePackageStatus(env, carePackageId)

  return jsonResponse({
    fileId: file.id,
    status: 'completed',
    uploadedBytes: file.size_bytes,
    uploadStrategy: 'direct',
  })
}

async function uploadMultipartPart(
  request: Request,
  env: RuntimeEnv,
  carePackageId: string,
  fileId: string,
  partNumber: number,
): Promise<Response> {
  if (!Number.isInteger(partNumber) || partNumber <= 0) {
    return errorResponse(400, 'invalid_part_number', 'Part number must be a positive integer.')
  }

  const carePackage = await getCarePackage(env, carePackageId)
  if (!carePackage) {
    return errorResponse(404, 'session_not_found', 'Upload session not found.')
  }

  if (isExpired(carePackage.expires_at)) {
    return errorResponse(410, 'session_expired', 'Upload session has expired.')
  }

  const file = await getCarePackageFile(env, carePackageId, fileId)
  if (!file) {
    return errorResponse(404, 'file_not_found', 'File record not found.')
  }

  if (file.upload_strategy !== 'multipart' || !file.part_size_bytes || !file.upload_id) {
    return errorResponse(409, 'multipart_not_initialized', 'Call the start endpoint before uploading parts.')
  }

  if (file.status === 'completed') {
    return jsonResponse({
      fileId: file.id,
      status: file.status,
      uploadedBytes: file.uploaded_bytes,
      completedParts: file.completed_parts,
    })
  }

  const expected = expectedPartSize(file.size_bytes, file.part_size_bytes, partNumber)
  if (!expected.ok) {
    return errorResponse(400, 'invalid_part_number', expected.message)
  }

  const body = await request.arrayBuffer()
  if (body.byteLength !== expected.value) {
    return errorResponse(409, 'part_size_mismatch', 'Uploaded part size did not match the expected size.', {
      expectedBytes: expected.value,
      receivedBytes: body.byteLength,
    })
  }

  const upload = env.UPLOADS_BUCKET.resumeMultipartUpload(file.object_key, file.upload_id)
  const part = await upload.uploadPart(partNumber, body)
  const parts = upsertUploadedPart(parseUploadedParts(file.uploaded_parts_json), {
    partNumber: part.partNumber,
    etag: part.etag,
    sizeBytes: body.byteLength,
  })

  const nowIso = new Date().toISOString()
  await env.DB.prepare(
    `
      UPDATE care_package_files
      SET
        status = ?,
        uploaded_parts_json = ?,
        uploaded_bytes = ?,
        completed_parts = ?,
        updated_at = ?
      WHERE id = ? AND care_package_id = ?
    `,
  )
    .bind(
      'uploading',
      JSON.stringify(parts),
      sumUploadedBytes(parts),
      parts.length,
      nowIso,
      file.id,
      carePackageId,
    )
    .run()

  await bumpCarePackageStatus(env, carePackageId)

  return jsonResponse({
    fileId: file.id,
    partNumber,
    uploadedBytes: sumUploadedBytes(parts),
    completedParts: parts.length,
    totalParts: totalPartsForFile(file.size_bytes, file.part_size_bytes),
  })
}

async function completeFileUpload(
  env: RuntimeEnv,
  carePackageId: string,
  fileId: string,
): Promise<Response> {
  const carePackage = await getCarePackage(env, carePackageId)
  if (!carePackage) {
    return errorResponse(404, 'session_not_found', 'Upload session not found.')
  }

  if (isExpired(carePackage.expires_at)) {
    return errorResponse(410, 'session_expired', 'Upload session has expired.')
  }

  const file = await getCarePackageFile(env, carePackageId, fileId)
  if (!file) {
    return errorResponse(404, 'file_not_found', 'File record not found.')
  }

  if (file.status === 'completed') {
    return jsonResponse({
      fileId: file.id,
      status: file.status,
      uploadedBytes: file.uploaded_bytes,
      etag: file.etag,
    })
  }

  if (file.upload_strategy !== 'multipart' || !file.part_size_bytes || !file.upload_id) {
    return errorResponse(409, 'multipart_not_initialized', 'Multipart upload has not started yet.')
  }

  const parts = parseUploadedParts(file.uploaded_parts_json)
  const expectedPartCount = totalPartsForFile(file.size_bytes, file.part_size_bytes)
  if (parts.length !== expectedPartCount) {
    return errorResponse(409, 'missing_parts', 'Upload is missing one or more parts.', {
      expectedPartCount,
      completedParts: parts.length,
    })
  }

  const upload = env.UPLOADS_BUCKET.resumeMultipartUpload(file.object_key, file.upload_id)
  const object = await upload.complete(
    parts.map(({ partNumber, etag }) => ({
      partNumber,
      etag,
    })),
  )

  const nowIso = new Date().toISOString()
  await env.DB.prepare(
    `
      UPDATE care_package_files
      SET
        status = ?,
        uploaded_bytes = ?,
        completed_parts = ?,
        etag = ?,
        updated_at = ?,
        completed_at = ?
      WHERE id = ? AND care_package_id = ?
    `,
  )
    .bind(
      'completed',
      file.size_bytes,
      parts.length,
      object.etag ?? 'multipart-upload',
      nowIso,
      nowIso,
      file.id,
      carePackageId,
    )
    .run()

  await bumpCarePackageStatus(env, carePackageId)

  return jsonResponse({
    fileId: file.id,
    status: 'completed',
    uploadedBytes: file.size_bytes,
    etag: object.etag,
  })
}

async function completeUploadSession(
  env: RuntimeEnv,
  carePackageId: string,
  config: AppConfig,
): Promise<Response> {
  const carePackage = await getCarePackage(env, carePackageId)
  if (!carePackage) {
    return errorResponse(404, 'session_not_found', 'Upload session not found.')
  }

  if (carePackage.status === 'completed') {
    const files = await listCarePackageFiles(env, carePackageId)
    return jsonResponse(serializeCarePackage(carePackage, files))
  }

  const files = await listCarePackageFiles(env, carePackageId)
  const incompleteFiles = files.filter((file) => file.status !== 'completed')
  if (incompleteFiles.length > 0) {
    return errorResponse(409, 'session_incomplete', 'All files must be completed before finalizing.', {
      pendingFileIds: incompleteFiles.map((file) => file.id),
    })
  }

  const committedBytes = files.reduce((sum, file) => sum + file.size_bytes, 0)
  const quota = await sendQuotaRequest(env, config, {
    kind: 'commit',
    sessionId: carePackageId,
    actualBytes: committedBytes,
  })

  if (!quota.ok) {
    return errorResponse(409, 'quota_commit_failed', readableQuotaMessage(quota.reason), quota)
  }

  const nowIso = new Date().toISOString()
  await env.DB.prepare(
    `
      UPDATE care_packages
      SET
        status = ?,
        committed_bytes = ?,
        updated_at = ?,
        completed_at = ?
      WHERE id = ?
    `,
  )
    .bind('completed', committedBytes, nowIso, nowIso, carePackageId)
    .run()

  const updated = await getCarePackage(env, carePackageId)
  if (!updated) {
    return errorResponse(500, 'session_missing_after_complete', 'Completed upload session could not be reloaded.')
  }

  return jsonResponse(serializeCarePackage(updated, files))
}

async function cancelUploadSession(
  env: RuntimeEnv,
  carePackageId: string,
  config: AppConfig,
): Promise<Response> {
  const carePackage = await getCarePackage(env, carePackageId)
  if (!carePackage) {
    return errorResponse(404, 'session_not_found', 'Upload session not found.')
  }

  const files = await listCarePackageFiles(env, carePackageId)
  await Promise.all(
    files.map(async (file) => {
      if (file.upload_strategy === 'multipart' && file.upload_id && file.status !== 'completed') {
        try {
          const upload = env.UPLOADS_BUCKET.resumeMultipartUpload(file.object_key, file.upload_id)
          await upload.abort()
        } catch {
          // Best effort cleanup only.
        }
      }
    }),
  )

  await sendQuotaRequest(env, config, {
    kind: 'release',
    sessionId: carePackageId,
  })

  const nowIso = new Date().toISOString()
  await env.DB.prepare(
    `
      UPDATE care_packages
      SET status = ?, updated_at = ?
      WHERE id = ?
    `,
  )
    .bind('cancelled', nowIso, carePackageId)
    .run()

  await env.DB.prepare(
    `
      UPDATE care_package_files
      SET status = CASE WHEN status = 'completed' THEN status ELSE 'cancelled' END, updated_at = ?
      WHERE care_package_id = ?
    `,
  )
    .bind(nowIso, carePackageId)
    .run()

  const updated = await getCarePackage(env, carePackageId)
  const updatedFiles = await listCarePackageFiles(env, carePackageId)
  if (!updated) {
    return errorResponse(500, 'session_missing_after_cancel', 'Cancelled upload session could not be reloaded.')
  }

  return jsonResponse(serializeCarePackage(updated, updatedFiles))
}

async function createAdminSession(request: Request, env: RuntimeEnv): Promise<Response> {
  const adminConfig = getAdminAuthConfig(env)
  if (!adminConfig.enabled) {
    return errorResponse(503, 'admin_not_configured', 'Admin password is not configured.')
  }

  const body = await readJson<AdminLoginBody>(request)
  const password = normalizeText(body?.password, 4_096)
  if (!password) {
    return errorResponse(400, 'missing_password', 'Password is required.')
  }

  if (!constantTimeEqual(password, adminConfig.password)) {
    return errorResponse(403, 'invalid_admin_password', 'Admin password is invalid.')
  }

  const nowMs = Date.now()
  const expiresAtMs = nowMs + adminConfig.sessionTtlHours * 60 * 60 * 1000
  const token = await signAdminSessionToken(
    {
      scope: 'admin',
      iat: nowMs,
      exp: expiresAtMs,
    },
    adminConfig.signingSecret,
  )

  return jsonResponse(
    {
      ok: true,
      expiresAt: new Date(expiresAtMs).toISOString(),
    },
    200,
    {
      'set-cookie': buildAdminSessionCookie(token, expiresAtMs, request),
    },
  )
}

async function getAdminSession(request: Request, env: RuntimeEnv): Promise<Response> {
  const session = await requireAdminSession(request, env)
  if ('response' in session) {
    return session.response
  }

  return jsonResponse({
    ok: true,
    scope: session.claims.scope,
    expiresAt: new Date(session.claims.exp).toISOString(),
  })
}

async function clearAdminSession(request: Request): Promise<Response> {
  return jsonResponse(
    {
      ok: true,
    },
    200,
    {
      'set-cookie': buildExpiredAdminSessionCookie(request),
    },
  )
}

async function listAdminCarePackages(request: Request, env: RuntimeEnv): Promise<Response> {
  const session = await requireAdminSession(request, env)
  if ('response' in session) {
    return session.response
  }

  const url = new URL(request.url)
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 20, 1), 50)
  const carePackages = await listRecentCarePackages(env, limit)
  const carePackagesWithFiles = await Promise.all(
    carePackages.map(async (carePackage) => ({
      carePackage,
      files: await listCarePackageFiles(env, carePackage.id),
    })),
  )

  return jsonResponse({
    items: carePackagesWithFiles.map(({ carePackage, files }) => ({
      carePackage: {
        id: carePackage.id,
        status: carePackage.status,
        senderName: carePackage.sender_name,
        comment: carePackage.comment,
        quotaMode: carePackage.quota_mode,
        declaredBytes: carePackage.declared_bytes,
        committedBytes: carePackage.committed_bytes,
        fileCount: carePackage.file_count,
        createdAt: carePackage.created_at,
        updatedAt: carePackage.updated_at,
        completedAt: carePackage.completed_at,
        tracking: {
          ipAddress: carePackage.ip_address,
          userAgent: carePackage.user_agent,
          cf: summarizeCfTracking(parseNullableJson(carePackage.request_cf_json)),
        },
      },
      files: files.map((file) => ({
        id: file.id,
        relativePath: file.relative_path,
        fileName: file.file_name,
        objectKey: file.object_key,
        sizeBytes: file.size_bytes,
        status: file.status,
        uploadedBytes: file.uploaded_bytes,
        completedParts: file.completed_parts,
        createdAt: file.created_at,
        updatedAt: file.updated_at,
        completedAt: file.completed_at,
      })),
    })),
  })
}

function getConfig(env: RuntimeEnv): AppConfig {
  return {
    bucketCapBytes: readInt(env.BUCKET_CAP_BYTES, 10 * 1024 * 1024 * 1024),
    publicHourlyCapBytes: readInt(env.PUBLIC_HOURLY_CAP_BYTES, 6 * 1024 * 1024 * 1024),
    publicPackageCapBytes: readInt(env.PUBLIC_PACKAGE_CAP_BYTES, 2 * 1024 * 1024 * 1024),
    uploadSessionTtlMinutes: readInt(env.UPLOAD_SESSION_TTL_MINUTES, 60 * 24),
    multipartChunkSizeBytes: Math.max(readInt(env.MULTIPART_CHUNK_SIZE_BYTES, 8 * 1024 * 1024), FIVE_MIB),
    directUploadMaxBytes: readInt(env.DIRECT_UPLOAD_MAX_BYTES, 32 * 1024 * 1024),
    headerSnapshotMaxBytes: readInt(env.HEADER_SNAPSHOT_MAX_BYTES, 4_096),
    maxFilesPerCarePackage: readInt(env.MAX_FILES_PER_CARE_PACKAGE, 5_000),
    turnstileRequired: readBoolean(env.TURNSTILE_REQUIRED, true),
    turnstileSiteKey: normalizeText(env.TURNSTILE_SITE_KEY, 512),
  }
}

function readInt(input: string | undefined, fallback: number): number {
  const parsed = Number(input)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function readBoolean(input: string | undefined, fallback: boolean): boolean {
  if (typeof input !== 'string') {
    return fallback
  }

  return ['1', 'true', 'yes', 'on'].includes(input.toLowerCase())
}

function getAdminAuthConfig(env: RuntimeEnv): {
  enabled: boolean
  password: string
  signingSecret: string
  sessionTtlHours: number
} {
  const password = normalizeText(env.ADMIN_PASSWORD, 4_096) ?? ''
  const signingSecret = normalizeText(env.ADMIN_SESSION_SECRET, 4_096) ?? ''
  return {
    enabled: Boolean(password && signingSecret),
    password,
    signingSecret,
    sessionTtlHours: readInt(env.ADMIN_SESSION_TTL_HOURS, 24 * 14),
  }
}

function matches(parts: string[], ...expected: string[]): boolean {
  return parts.length === expected.length && parts.every((part, index) => part === expected[index])
}

function jsonResponse(data: unknown, status = 200, extraHeaders?: HeadersInit): Response {
  const headers = new Headers(extraHeaders)
  headers.set('content-type', 'application/json; charset=utf-8')
  headers.set('cache-control', 'no-store')
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers,
  })
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left)
  const rightBytes = new TextEncoder().encode(right)
  const maxLength = Math.max(leftBytes.length, rightBytes.length)
  let diff = leftBytes.length === rightBytes.length ? 0 : 1

  for (let index = 0; index < maxLength; index += 1) {
    const leftValue = leftBytes[index] ?? 0
    const rightValue = rightBytes[index] ?? 0
    diff |= leftValue ^ rightValue
  }

  return diff === 0
}

async function hmacSign(secret: string, input: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    {
      name: 'HMAC',
      hash: 'SHA-256',
    },
    false,
    ['sign'],
  )

  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(input))
  return new Uint8Array(signature)
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64UrlToBytes(input: string): Uint8Array {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(input.length / 4) * 4, '=')
  const binary = atob(padded)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

function textToBase64Url(input: string): string {
  return bytesToBase64Url(new TextEncoder().encode(input))
}

function base64UrlToText(input: string): string {
  return new TextDecoder().decode(base64UrlToBytes(input))
}

async function signAdminSessionToken(claims: AdminSessionClaims, secret: string): Promise<string> {
  const payload = textToBase64Url(JSON.stringify(claims))
  const signature = bytesToBase64Url(await hmacSign(secret, payload))
  return `${payload}.${signature}`
}

async function verifyAdminSessionToken(token: string, secret: string): Promise<AdminSessionClaims | null> {
  const [payload, signature] = token.split('.')
  if (!payload || !signature) {
    return null
  }

  const expectedSignature = bytesToBase64Url(await hmacSign(secret, payload))
  if (!constantTimeEqual(signature, expectedSignature)) {
    return null
  }

  try {
    const parsed = JSON.parse(base64UrlToText(payload)) as Partial<AdminSessionClaims>
    if (parsed.scope !== 'admin' || typeof parsed.iat !== 'number' || typeof parsed.exp !== 'number') {
      return null
    }

    return {
      scope: 'admin',
      iat: parsed.iat,
      exp: parsed.exp,
    }
  } catch {
    return null
  }
}

function getBearerToken(request: Request): string | null {
  const authorization = request.headers.get('authorization')
  if (!authorization) {
    return null
  }

  const [scheme, token] = authorization.split(/\s+/, 2)
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return null
  }

  return token.trim() || null
}

function getCookieValue(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get('cookie')
  if (!cookieHeader) {
    return null
  }

  const parts = cookieHeader.split(/;\s*/)
  for (const part of parts) {
    const [cookieName, ...rest] = part.split('=')
    if (cookieName === name) {
      return rest.join('=').trim() || null
    }
  }

  return null
}

function isSecureRequest(request: Request): boolean {
  return new URL(request.url).protocol === 'https:'
}

function buildCookie({
  name,
  value,
  maxAgeSeconds,
  request,
}: {
  name: string
  value: string
  maxAgeSeconds: number
  request: Request
}): string {
  const segments = [
    `${name}=${value}`,
    'Path=/api/admin',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`,
  ]

  if (isSecureRequest(request)) {
    segments.push('Secure')
  }

  return segments.join('; ')
}

function buildAdminSessionCookie(token: string, expiresAtMs: number, request: Request): string {
  const maxAgeSeconds = Math.max(0, Math.floor((expiresAtMs - Date.now()) / 1000))
  return buildCookie({
    name: ADMIN_SESSION_COOKIE,
    value: token,
    maxAgeSeconds,
    request,
  })
}

function buildExpiredAdminSessionCookie(request: Request): string {
  return buildCookie({
    name: ADMIN_SESSION_COOKIE,
    value: '',
    maxAgeSeconds: 0,
    request,
  })
}

async function requireAdminSession(
  request: Request,
  env: RuntimeEnv,
): Promise<{ claims: AdminSessionClaims } | { response: Response }> {
  const adminConfig = getAdminAuthConfig(env)
  if (!adminConfig.enabled) {
    return {
      response: errorResponse(503, 'admin_not_configured', 'Admin password is not configured.'),
    }
  }

  const token = getCookieValue(request, ADMIN_SESSION_COOKIE) ?? getBearerToken(request)
  if (!token) {
    return {
      response: errorResponse(401, 'missing_admin_session', 'Admin session is required.'),
    }
  }

  const claims = await verifyAdminSessionToken(token, adminConfig.signingSecret)
  if (!claims) {
    return {
      response: errorResponse(401, 'invalid_admin_session', 'Admin session is invalid.'),
    }
  }

  if (claims.exp <= Date.now()) {
    return {
      response: errorResponse(401, 'expired_admin_session', 'Admin session has expired.'),
    }
  }

  return { claims }
}

function errorResponse(
  status: number,
  code: string,
  message: string,
  details?: unknown,
): Response {
  return jsonResponse(
    {
      error: {
        code,
        message,
        details,
      },
    },
    status,
  )
}

async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T
  } catch {
    return null
  }
}

function normalizeText(input: unknown, maxLength: number): string | null {
  if (typeof input !== 'string') {
    return null
  }

  const value = input.trim()
  if (!value) {
    return null
  }

  return value.slice(0, maxLength)
}

function normalizeFiles(
  input: unknown,
  maxFiles: number,
): { ok: true; value: FileManifestInput[] } | { ok: false; message: string } {
  if (!Array.isArray(input) || input.length === 0) {
    return { ok: false, message: 'Provide at least one file in the upload manifest.' }
  }

  if (input.length > maxFiles) {
    return { ok: false, message: `A care package can include at most ${maxFiles} files.` }
  }

  const seen = new Set<string>()
  const files: FileManifestInput[] = []

  for (const value of input) {
    if (!value || typeof value !== 'object') {
      return { ok: false, message: 'Every file manifest entry must be an object.' }
    }

    const candidate = value as JsonRecord
    const relativePath = normalizeRelativePath(candidate.relativePath)
    if (!relativePath) {
      return { ok: false, message: 'Each file requires a safe relative path.' }
    }

    if (seen.has(relativePath)) {
      return { ok: false, message: `Duplicate file path detected: ${relativePath}` }
    }

    const sizeBytes = Number(candidate.sizeBytes)
    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
      return { ok: false, message: `Invalid file size for ${relativePath}.` }
    }

    const contentType = normalizeText(candidate.contentType, 255)
    const lastModified =
      typeof candidate.lastModified === 'number' && Number.isFinite(candidate.lastModified)
        ? candidate.lastModified
        : null

    seen.add(relativePath)
    files.push({
      relativePath,
      sizeBytes,
      contentType,
      lastModified,
    })
  }

  return { ok: true, value: files }
}

function normalizeRelativePath(input: unknown): string | null {
  if (typeof input !== 'string') {
    return null
  }

  const cleaned = input
    .replace(/\\/g, '/')
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)

  if (cleaned.length === 0 || cleaned.some((segment) => segment === '.' || segment === '..')) {
    return null
  }

  return cleaned.join('/')
}

function basename(path: string): string {
  const parts = path.split('/')
  return parts[parts.length - 1] ?? path
}

function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`
}

async function computeUploadCodeHash(code: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${code.trim()}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function findActiveUploadCode(env: RuntimeEnv, code: string): Promise<UploadCodeRow | null> {
  const salt = normalizeText(env.UPLOAD_CODE_HASH_SALT, 4_096)
  if (!salt) {
    return null
  }

  const codeHash = await computeUploadCodeHash(code, salt)
  const nowIso = new Date().toISOString()
  return (
    (await env.DB.prepare(
      `
        SELECT *
        FROM upload_codes
        WHERE code_hash = ?
          AND status = 'active'
          AND expires_at > ?
        LIMIT 1
      `,
    )
      .bind(codeHash, nowIso)
      .first<UploadCodeRow>()) ?? null
  )
}

async function validateTurnstile(
  request: Request,
  env: RuntimeEnv,
  config: AppConfig,
  token: string | null,
): Promise<{ ok: true } | { ok: false; errors: string[] }> {
  if (isLocalTurnstileBypassEnabled(request, env)) {
    return { ok: true }
  }

  if (!config.turnstileRequired) {
    return { ok: true }
  }

  const secret = normalizeText(env.TURNSTILE_SECRET_KEY, 4_096)
  if (!secret) {
    return { ok: false, errors: ['missing_turnstile_secret'] }
  }

  if (!token) {
    return { ok: false, errors: ['missing_turnstile_token'] }
  }

  const form = new FormData()
  form.set('secret', secret)
  form.set('response', token)

  const remoteIp = request.headers.get('CF-Connecting-IP')
  if (remoteIp) {
    form.set('remoteip', remoteIp)
  }

  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: form,
  })

  const payload = (await response.json()) as {
    success?: boolean
    'error-codes'?: string[]
  }

  if (payload.success) {
    return { ok: true }
  }

  return { ok: false, errors: payload['error-codes'] ?? ['turnstile_verification_failed'] }
}

function snapshotHeaders(request: Request, maxBytes: number): string {
  const headers: Record<string, string> = {}

  for (const [key, value] of request.headers.entries()) {
    const lower = key.toLowerCase()
    if (lower === 'authorization' || lower === 'cookie') {
      continue
    }

    headers[lower] = value.slice(0, 512)
  }

  const serialized = JSON.stringify(headers)
  if (serialized.length <= maxBytes) {
    return serialized
  }

  return `${serialized.slice(0, maxBytes - 1)}…`
}

function isLocalTurnstileBypassEnabled(request: Request, env: RuntimeEnv): boolean {
  const enabled = normalizeText(env.LOCAL_TURNSTILE_BYPASS, 32)
  if (!enabled || !readBoolean(enabled, false)) {
    return false
  }

  const hostname = new URL(request.url).hostname.toLowerCase()
  return hostname === 'localhost' || hostname === '127.0.0.1'
}

async function sendQuotaRequest(
  env: RuntimeEnv,
  config: AppConfig,
  payload: Omit<QuotaRequestPayload, 'nowMs' | 'bucketCapBytes' | 'publicHourlyCapBytes'>,
): Promise<QuotaResponse> {
  const id = env.QUOTA_COORDINATOR.idFromName('global-care-package-quota')
  const stub = env.QUOTA_COORDINATOR.get(id)
  const response = await stub.fetch('https://quota.internal', {
    method: 'POST',
    body: JSON.stringify({
      ...payload,
      nowMs: Date.now(),
      bucketCapBytes: config.bucketCapBytes,
      publicHourlyCapBytes: config.publicHourlyCapBytes,
    } satisfies QuotaRequestPayload),
  })

  return (await response.json()) as QuotaResponse
}

async function getCarePackage(
  env: RuntimeEnv,
  carePackageId: string,
): Promise<CarePackageRow | null> {
  return (
    (await env.DB.prepare(`SELECT * FROM care_packages WHERE id = ?`)
      .bind(carePackageId)
      .first<CarePackageRow>()) ?? null
  )
}

async function listRecentCarePackages(env: RuntimeEnv, limit: number): Promise<CarePackageRow[]> {
  const result = await env.DB.prepare(
    `
      SELECT *
      FROM care_packages
      ORDER BY created_at DESC
      LIMIT ?
    `,
  )
    .bind(limit)
    .all<CarePackageRow>()

  return result.results ?? []
}

async function listCarePackageFiles(
  env: RuntimeEnv,
  carePackageId: string,
): Promise<CarePackageFileRow[]> {
  const result = await env.DB.prepare(
    `SELECT * FROM care_package_files WHERE care_package_id = ? ORDER BY relative_path ASC`,
  )
    .bind(carePackageId)
    .all<CarePackageFileRow>()

  return result.results ?? []
}

async function getCarePackageFile(
  env: RuntimeEnv,
  carePackageId: string,
  fileId: string,
): Promise<CarePackageFileRow | null> {
  return (
    (await env.DB.prepare(
      `SELECT * FROM care_package_files WHERE care_package_id = ? AND id = ?`,
    )
      .bind(carePackageId, fileId)
      .first<CarePackageFileRow>()) ?? null
  )
}

function serializeCarePackage(
  carePackage: CarePackageRow,
  files: CarePackageFileRow[],
): Record<string, unknown> {
  return {
    carePackage: {
      id: carePackage.id,
      status: carePackage.status,
      senderName: carePackage.sender_name,
      comment: carePackage.comment,
      quotaMode: carePackage.quota_mode,
      declaredBytes: carePackage.declared_bytes,
      committedBytes: carePackage.committed_bytes,
      reservedBytes: carePackage.reserved_bytes,
      fileCount: carePackage.file_count,
      createdAt: carePackage.created_at,
      updatedAt: carePackage.updated_at,
      completedAt: carePackage.completed_at,
      expiresAt: carePackage.expires_at,
      tracking: {
        ipAddress: carePackage.ip_address,
        userAgent: carePackage.user_agent,
        requestHeaders: parseNullableJson(carePackage.request_headers_json),
        cf: parseNullableJson(carePackage.request_cf_json),
      },
    },
    files: files.map((file) => ({
      id: file.id,
      relativePath: file.relative_path,
      fileName: file.file_name,
      objectKey: file.object_key,
      sizeBytes: file.size_bytes,
      contentType: file.content_type,
      lastModified: file.last_modified,
      uploadStrategy: file.upload_strategy,
      status: file.status,
      uploadId: file.upload_id,
      partSizeBytes: file.part_size_bytes,
      uploadedBytes: file.uploaded_bytes,
      completedParts: file.completed_parts,
      uploadedParts: parseUploadedParts(file.uploaded_parts_json),
      etag: file.etag,
      createdAt: file.created_at,
      updatedAt: file.updated_at,
      completedAt: file.completed_at,
    })),
  }
}

function parseNullableJson(input: string | null): unknown {
  if (!input) {
    return null
  }

  try {
    return JSON.parse(input)
  } catch {
    return input
  }
}

function summarizeCfTracking(input: unknown) {
  if (!input || typeof input !== 'object') {
    return null
  }

  const record = input as Record<string, unknown>
  return {
    country: typeof record.country === 'string' ? record.country : null,
    region: typeof record.region === 'string' ? record.region : null,
    city: typeof record.city === 'string' ? record.city : null,
    timezone: typeof record.timezone === 'string' ? record.timezone : null,
    colo: typeof record.colo === 'string' ? record.colo : null,
  }
}

function parseUploadedParts(input: string): UploadedPartRecord[] {
  try {
    const parsed = JSON.parse(input) as UploadedPartRecord[]
    return Array.isArray(parsed)
      ? parsed
          .filter(
            (part) =>
              Number.isInteger(part.partNumber) &&
              typeof part.etag === 'string' &&
              typeof part.sizeBytes === 'number',
          )
          .sort((left, right) => left.partNumber - right.partNumber)
      : []
  } catch {
    return []
  }
}

function upsertUploadedPart(
  parts: UploadedPartRecord[],
  nextPart: UploadedPartRecord,
): UploadedPartRecord[] {
  const filtered = parts.filter((part) => part.partNumber !== nextPart.partNumber)
  filtered.push(nextPart)
  return filtered.sort((left, right) => left.partNumber - right.partNumber)
}

function sumUploadedBytes(parts: UploadedPartRecord[]): number {
  return parts.reduce((sum, part) => sum + part.sizeBytes, 0)
}

function totalPartsForFile(sizeBytes: number, partSizeBytes: number): number {
  return Math.ceil(sizeBytes / partSizeBytes)
}

function expectedPartSize(
  sizeBytes: number,
  partSizeBytes: number,
  partNumber: number,
): { ok: true; value: number } | { ok: false; message: string } {
  const totalParts = totalPartsForFile(sizeBytes, partSizeBytes)
  if (partNumber > totalParts) {
    return { ok: false, message: 'Part number exceeds the total number of parts for this file.' }
  }

  if (partNumber < totalParts) {
    return { ok: true, value: partSizeBytes }
  }

  const tail = sizeBytes - partSizeBytes * (totalParts - 1)
  if (totalParts > 1 && tail < FIVE_MIB && tail !== sizeBytes) {
    return { ok: true, value: tail }
  }

  return { ok: true, value: tail }
}

function pruneReservations(
  reservations: Record<string, ReservationEntry>,
  nowMs: number,
): Record<string, ReservationEntry> {
  return Object.fromEntries(
    Object.entries(reservations).filter(([, reservation]) => reservation.expiresAtMs > nowMs),
  )
}

function sumReservationBytes(reservations: Record<string, ReservationEntry>): number {
  return Object.values(reservations).reduce((sum, reservation) => sum + reservation.bytes, 0)
}

function sumHourlyBytes(
  events: Array<{ bytes: number; bypassHourlyCap: boolean; createdAtMs: number }>,
): number {
  return events
    .filter((entry) => !entry.bypassHourlyCap)
    .reduce((sum, entry) => sum + entry.bytes, 0)
}

function readableQuotaMessage(reason: string | undefined): string {
  if (reason === 'public_hourly_cap_exceeded') {
    return 'The public hourly upload cap has been reached.'
  }

  if (reason === 'bucket_cap_exceeded') {
    return 'The configured bucket cap has been reached.'
  }

  return 'Quota reservation was rejected.'
}

function isExpired(iso: string): boolean {
  return new Date(iso).getTime() <= Date.now()
}

async function bumpCarePackageStatus(env: RuntimeEnv, carePackageId: string): Promise<void> {
  await env.DB.prepare(
    `
      UPDATE care_packages
      SET status = CASE WHEN status = 'initiated' THEN 'uploading' ELSE status END,
          updated_at = ?
      WHERE id = ?
    `,
  )
    .bind(new Date().toISOString(), carePackageId)
    .run()
}
