/**
 * 최신 릴리스에서 설치용 APK 를 받아 site/ 에 넣는다 — **Vercel 빌드용.**
 *
 *   node tools/fetch-apk.mjs            → site/catpaw-defense-latest.apk
 *   GH_TOKEN=… node tools/fetch-apk.mjs → 저장소가 Private 일 때 (릴리스 자산도 비공개라 토큰이 있어야 받아진다)
 *
 * 왜 있나: R 에서 사이트가 APK 를 직접 주게 바꿨다(다운로드 버튼이 GitHub 을 안 거치게 — 누르는 순간 주소창에
 * 계정 이름이 뜨던 것). 그 받기 스텝을 `pages.yml` 에 `gh release download` 로 넣었는데, Private 전환의 대체
 * 호스팅인 Vercel 에는 `gh` 도 그 스텝도 없다 — 그대로 옮겼으면 **다운로드 버튼이 404** 였다. 이 파일이 그 구멍이다.
 * `pages.yml` 은 검증된 채로 두고 안 바꿨다(같은 일을 두 벌로 하는 것은 알고 있다).
 *
 * 실패하면 **크게 실패한다**(exit 1). 죽은 다운로드 버튼을 올리느니 배포를 안 하는 게 낫다 — `pages.yml` 과 같은 원칙.
 *
 * 저장소 이름은 환경에서 읽는다. Vercel 은 VERCEL_GIT_REPO_OWNER / VERCEL_GIT_REPO_SLUG 를, GitHub Actions 는
 * GITHUB_REPOSITORY 를 준다. 코드에 계정 이름을 안 적는다 — R 의 "계정 이름이 새지 않는다" 검사와 같은 결이다.
 */
import { writeFile, mkdir, stat } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const TAG = 'dev'                              // release.yml 의 수동 실행이 늘 이 태그를 다시 만든다
const ASSET = 'catpaw-defense-latest.apk'      // 버전 안 박힌 고정 이름 — site/index.html 의 버튼이 이걸 가리킨다

function repoFromEnv(env = process.env) {
  if (env.GITHUB_REPOSITORY) return env.GITHUB_REPOSITORY
  if (env.VERCEL_GIT_REPO_OWNER && env.VERCEL_GIT_REPO_SLUG) return `${env.VERCEL_GIT_REPO_OWNER}/${env.VERCEL_GIT_REPO_SLUG}`
  if (env.CATPAW_REPO) return env.CATPAW_REPO
  return null
}

export async function fetchApk({ repo = repoFromEnv(), token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN, outDir } = {}) {
  if (!repo) throw new Error('저장소를 모른다 — GITHUB_REPOSITORY 나 VERCEL_GIT_REPO_OWNER/SLUG 나 CATPAW_REPO 를 준다')
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  outDir = outDir || join(root, 'site')
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'catpaw-fetch-apk' }
  if (token) headers.Authorization = `Bearer ${token}`

  const rel = await fetch(`https://api.github.com/repos/${repo}/releases/tags/${TAG}`, { headers })
  if (!rel.ok) {
    // 401 은 토큰을 보냈는데 거부된 것(값·만료·권한) — 없어서 난 것과 다르다. 빌드 환경에 엉뚱한 토큰이
    // 깔려 있으면 여기서 걸린다(실제로 이 세션의 GITHUB_TOKEN 이 그랬다). 조용히 익명으로 떨어지지 않는다.
    const why = token
      ? (rel.status === 401 ? ' — 보낸 토큰이 거부됐다. GH_TOKEN 의 값과 권한(repo 읽기)을 확인한다' : '')
      : ' — 토큰 없이 갔다. Private 저장소면 GH_TOKEN 이 필요하다'
    throw new Error(`릴리스 '${TAG}' 를 못 읽었다: HTTP ${rel.status}${why}`)
  }
  const asset = (await rel.json()).assets.find((a) => a.name === ASSET)
  if (!asset) throw new Error(`릴리스 '${TAG}' 에 ${ASSET} 이 없다 — release.yml 이 별칭을 안 올렸다`)

  // 자산 본문은 API 주소에 octet-stream 을 요구해야 온다(브라우저 주소는 Private 이면 로그인 페이지로 튄다)
  const res = await fetch(asset.url, { headers: { ...headers, Accept: 'application/octet-stream' } })
  if (!res.ok) throw new Error(`APK 받기 실패: HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length !== asset.size) throw new Error(`받은 크기 ${buf.length} ≠ 릴리스 크기 ${asset.size} — 잘린 파일이다`)

  await mkdir(outDir, { recursive: true })
  const out = join(outDir, ASSET)
  await writeFile(out, buf)
  return { out, size: (await stat(out)).size, repo }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  fetchApk().then((r) => {
    console.log(`APK → ${r.out} (${r.size} bytes · ${r.repo} · ${TAG})`)
  }).catch((e) => {
    console.error(`fetch-apk: ${e.message}`)
    process.exit(1)
  })
}
