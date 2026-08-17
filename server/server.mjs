import express from 'express'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, rm, stat } from 'node:fs/promises'
import { createReadStream, createWriteStream, existsSync } from 'node:fs'
import { dirname, join, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const HOST = process.env.HOST ?? '0.0.0.0'
const PORT = Number(process.env.PORT ?? 8787)
const MAX_UPLOAD_BYTES = 16 * 1024 * 1024 * 1024
const WORK_DIR = join(dirname(fileURLToPath(import.meta.url)), 'tmp')
const INPUTS_DIR = join(WORK_DIR, 'in')
const OUTPUTS_DIR = join(WORK_DIR, 'out')
await mkdir(INPUTS_DIR, { recursive: true })
await mkdir(OUTPUTS_DIR, { recursive: true })

const ts = () => new Date().toLocaleTimeString('en-GB', { hour12: false })
const log = (...args) => console.log(`[${ts()}]`, ...args)

// Clean up leftovers from a previous run (jobs are in-memory, so anything on
// disk without a live job is orphaned — e.g. after a crash or restart).
for (const dir of [INPUTS_DIR, OUTPUTS_DIR]) {
  const { readdir } = await import('node:fs/promises')
  const names = await readdir(dir).catch(() => [])
  for (const name of names) {
    await rm(join(dir, name), { force: true }).catch(() => {})
  }
  if (names.length) log(`Startup sweep: removed ${names.length} orphaned file(s) from ${dir}`)
}

const app = express()
app.use(express.json())

const readBodyToFile = (req, dest) => new Promise((resolve, reject) => {
  const stream = createWriteStream(dest)
  let size = 0
  req.on('data', (chunk) => {
    size += chunk.length
    if (size > MAX_UPLOAD_BYTES) {
      stream.destroy()
      req.destroy(new Error('Upload exceeds the 16 GB limit.'))
      return
    }
    stream.write(chunk)
  })
  req.on('aborted', () => reject(new Error(`Request aborted by the client after ${(size / (1024 * 1024)).toFixed(1)} MB.`)))
  req.on('error', (error) => reject(error))
  req.on('end', () => stream.end(() => resolve(size)))
})

const PROFILES = {
  h264: { encoder: 'libx264' },
  h265: { encoder: 'libx265' },
}

const jobs = new Map()

const outputNameFor = (name, codec, crf) => `${basename(name).replace(/\.[^.]+$/, '')}.compressed.${codec}.crf${crf}.mp4`

const probeDuration = (input) => new Promise((resolve) => {
  const child = spawn('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', input])
  let out = ''
  child.stdout.on('data', (chunk) => { out += chunk.toString() })
  child.on('close', () => {
    const seconds = Number.parseFloat(out.trim())
    resolve(Number.isFinite(seconds) && seconds > 0 ? seconds : 0)
  })
})

const runWorker = async () => {
  if (runWorker.active) return
  runWorker.active = true
  const queued = [...jobs.values()].filter((job) => job.status === 'queued')
  if (queued.length) log(`Worker awake — ${queued.length} queued job(s).`)
  for (const job of queued) {
    await processJob(job).catch((error) => {
      job.status = 'failed'
      job.error = String(error?.message ?? error)
      log(`Job ${job.id} FAILED: ${job.error}`)
    })
  }
  runWorker.active = false
}
runWorker.active = false

const processJob = async (job) => {
  job.status = 'converting'
  job.startedAt = Date.now()
  const codec = PROFILES[job.codec]
  if (!codec) throw new Error(`Unknown codec: ${job.codec}`)
  if (![25, 28].includes(job.crf)) throw new Error(`CRF must be 25 or 28`)
  const duration = await probeDuration(job.inputPath)
  job.outputName = outputNameFor(job.originalName, job.codec, job.crf)
  job.outputPath = join(OUTPUTS_DIR, `${job.id}.mp4`)
  log(`Encoding ${job.originalName} → ${job.outputName} (${job.codec} crf ${job.crf}, ${Number(duration).toFixed(1)}s of source)`)
  const args = ['-y', '-i', job.inputPath, '-c:v', codec.encoder, '-crf', String(job.crf), '-preset', 'medium', '-pix_fmt', 'yuv420p']
  if (job.codec === 'h265') args.push('-tag:v', 'hvc1')
  args.push('-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', job.outputPath)
  await new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', args)
    let lastLogged = 0
    let stderr = ''
    child.stderr.on('data', (chunk) => { stderr += chunk.toString() })
    const timer = setInterval(() => {
      let progress = 0
      if (duration > 0) progress = Math.round((parseTime(stderr) / duration) * 100)
      job.progress = Math.max(job.progress, Math.max(1, Math.min(99, progress)))
      if (job.progress - lastLogged >= 10) {
        lastLogged = job.progress
        log(`  ${job.id.slice(0, 8)} · ${job.progress}%`)
      }
    }, 400)
    child.on('close', (code) => {
      clearInterval(timer)
      if (code === 0) {
        stat(job.outputPath).then((info) => { job.outputSize = info.size }).catch(() => {})
        job.status = 'completed'
        job.progress = 100
        const elapsed = ((Date.now() - job.startedAt) / 1000).toFixed(1)
        log(`Job ${job.id.slice(0, 8)} COMPLETED in ${elapsed}s`)
        resolve()
      } else {
        const detail = tail(stderr).trim() || `ffmpeg exited with code ${code}`
        job.error = detail
        job.status = 'failed'
        log(`Job ${job.id.slice(0, 8)} ffmpeg FAILED (code ${code})`)
        reject(new Error(detail))
      }
    })
    child.on('error', (error) => { clearInterval(timer); log(`  Failed to spawn ffmpeg: ${error.message}`); reject(error) })
  })
  await rm(job.inputPath, { force: true }).catch(() => {})
}

const parseTime = (stderr) => {
  const match = /time=(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr)
  if (!match) return 0
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])
}

const tail = (text, lines = 6) => text.trim().split('\n').slice(-lines).join('\n')

const publicJob = (job) => ({
  id: job.id,
  status: job.status,
  progress: job.progress,
  codec: job.codec,
  crf: job.crf,
  outputName: job.outputName,
  outputSize: job.outputSize,
  error: job.error,
})

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'clippress-compress', ffmpeg: process.env.FFMPEG_PATH ?? 'ffmpeg' })
})

app.post('/api/compress', async (req, res) => {
  const uploadId = randomUUID()
  const inputPath = join(INPUTS_DIR, `${uploadId}.mp4`)
  try {
    const size = await readBodyToFile(req, inputPath)
    const originalName = decodeURIComponent(String(req.headers['x-filename'] ?? '')) || 'video.mp4'
    const codec = String(req.headers['x-codec'] ?? '')
    const crf = Number(req.headers['x-crf'] ?? '')
    log(`Upload received: ${originalName} (${(size / (1024 * 1024)).toFixed(1)} MB)`)
    if (!PROFILES[codec] || ![25, 28].includes(crf)) {
      log(`Upload REJECTED (codec "${codec}", crf "${crf}")`)
      rm(inputPath, { force: true }).catch(() => {})
      return res.status(400).json({ error: 'codec must be h264 or h265 and crf must be 25 or 28.' })
    }
    const job = {
      id: uploadId,
      originalName,
      inputPath,
      codec,
      crf,
      status: 'queued',
      progress: 0,
    }
    jobs.set(job.id, job)
    log(`Queued job ${job.id.slice(0, 8)} — ${originalName} (${codec} crf ${crf}) — ${jobs.size} job(s) in queue.`)
    void runWorker()
    res.status(201).json(publicJob(job))
  } catch (error) {
    log(`Upload FAILED: ${error.message}`)
    rm(inputPath, { force: true }).catch(() => {})
    if (!res.headersSent) res.status(400).json({ error: String(error.message ?? error) })
  }
})

app.get('/api/jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id)
  if (!job) {
    log(`Status poll for unknown job ${req.params.id.slice(0, 8)} → 404`)
    return res.status(404).json({ error: 'Job not found.' })
  }
  res.json(publicJob(job))
})

app.get('/api/jobs/:id/output', (req, res) => {
  const job = jobs.get(req.params.id)
  if (!job) return res.status(404).json({ error: 'Job not found.' })
  if (job.status !== 'completed' || !job.outputPath || !existsSync(job.outputPath)) {
    return res.status(409).json({ error: 'Output is not ready.' })
  }
  log(`Serving output for job ${job.id.slice(0, 8)}: ${job.outputName}`)
  res.setHeader('Content-Type', 'video/mp4')
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(job.outputName)}"`)
  createReadStream(job.outputPath).pipe(res)
})

app.delete('/api/jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id)
  if (!job) return res.status(404).json({ error: 'Job not found.' })
  rm(job.inputPath, { force: true }).catch(() => {})
  rm(job.outputPath, { force: true }).catch(() => {})
  jobs.delete(req.params.id)
  log(`Deleted job ${job.id.slice(0, 8)} (${job.originalName})`)
  res.json({ ok: true })
})

const server = app.listen(PORT, HOST, async () => {
  log(`clippress compression server listening on http://${HOST}:${PORT} (pid ${process.pid})`)
  // A 1.4 GB upload over Wi-Fi can stream for well over 5 minutes; the default
  // requestTimeout (300s) kills it mid-body. Disable it and log the response.
  server.requestTimeout = 0
  server.headersTimeout = 0
  const version = await new Promise((resolve) => {
    const child = spawn('ffmpeg', ['-version'])
    let out = ''
    child.stdout.on('data', (chunk) => { out += chunk.toString() })
    child.on('close', () => resolve(out.split('\n')[0] ?? 'ffmpeg (version unknown)'))
  })
  log(`Using ${version}`)
  log(`FFMPEG_PATH=${process.env.FFMPEG_PATH ?? '(default PATH)'}`)
})