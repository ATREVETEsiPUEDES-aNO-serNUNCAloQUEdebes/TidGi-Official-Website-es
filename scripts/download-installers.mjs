import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { mkdir, rename, rm, stat } from 'fs/promises';
import Bluebird from 'bluebird';
import { backOff } from 'exponential-backoff';
import 'dotenv/config';

const { GITHUB_TOKEN } = process.env;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const downloadFolder = path.join(__dirname, '../files/downloaders');
const proxyUrl = process.env.DOWNLOAD_PROXY ?? 'socks5h://127.0.0.1:1080';
const useProxy = proxyUrl !== '' && !['0', 'false', 'none', 'direct'].includes(proxyUrl.toLowerCase());
const curlCommand = process.platform === 'win32' ? 'curl.exe' : 'curl';

/* 
set DOWNLOAD_PROXY=socks5h://127.0.0.1:1080
set DOWNLOAD_PROXY=direct
*/

function getHeaderArgs(headers) {
  return Object.entries(headers).flatMap(([key, value]) => ['--header', `${key}: ${value}`]);
}

function getProxyArgs() {
  return useProxy ? ['--proxy', proxyUrl] : [];
}

async function runCurl(args) {
  return await new Promise((resolve, reject) => {
    const child = spawn(curlCommand, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }
      reject(new Error(`${curlCommand} exited with code ${code}: ${stderr || stdout}`));
    });
  });
}

function getGithubHeaders(accept = 'application/vnd.github+json') {
  const headers = {
    Accept: accept,
    'User-Agent': 'TidGi-Official-Website-downloader',
  };
  if (GITHUB_TOKEN) {
    headers.Authorization = `token ${GITHUB_TOKEN}`;
  }
  return headers;
}

async function fetchJson(url) {
  const text = await runCurl([
    '--fail',
    '--location',
    '--silent',
    '--show-error',
    '--connect-timeout',
    '30',
    ...getProxyArgs(),
    ...getHeaderArgs(getGithubHeaders()),
    url,
  ]);
  return JSON.parse(text);
}

async function downloadFile(url, headers, destination) {
  await runCurl([
    '--fail',
    '--location',
    '--silent',
    '--show-error',
    '--connect-timeout',
    '30',
    '--retry',
    '5',
    '--retry-all-errors',
    ...getProxyArgs(),
    ...getHeaderArgs(headers),
    '--output',
    destination,
    url,
  ]);
}

const latestDesktopReleaseData = await fetchJson('https://api.github.com/repos/tiddly-gittly/TidGi-Desktop/releases/latest');
const latestMobileReleaseData = await fetchJson('https://api.github.com/repos/tiddly-gittly/TidGi-Mobile/releases/latest');
if (typeof latestDesktopReleaseData.tag_name === 'undefined') {
  console.warn(latestDesktopReleaseData);
  throw new Error('Try add github token to .env file');
}
const latestDesktopVersion = latestDesktopReleaseData.tag_name.replace(/^v/, '');
const latestDesktopVersionBase = latestDesktopVersion.match(/\d+\.\d+\.\d+/)?.[0] ?? latestDesktopVersion;
const desktopUrls = latestDesktopReleaseData.assets.map((asset) => asset.browser_download_url);
const mobileUrls = latestMobileReleaseData.assets.map((asset) => asset.browser_download_url);
console.log(desktopUrls);
console.log(mobileUrls);
console.log(`Download proxy: ${useProxy ? proxyUrl : 'direct'}`);
// download urls to `files/downloaders` folder

async function downloadAsset(asset, rename) {
  const fileName = rename(asset.name);
  console.log(`Downloading ${fileName} from ${asset.browser_download_url}`);
  const headers = getGithubHeaders('application/octet-stream');
  const destination = path.join(downloadFolder, fileName);
  const temporaryDestination = `${destination}.download`;
  await rm(temporaryDestination, { force: true });
  try {
    await downloadFile(asset.browser_download_url, headers, temporaryDestination);
    const stats = await stat(temporaryDestination);
    if (stats.size !== asset.size) {
      throw new Error(`File size mismatch for ${fileName}: expected ${asset.size}, got ${stats.size}`);
    }
    await rm(destination, { force: true });
    await rename(temporaryDestination, destination);
    console.log(`Done ${fileName}`);
    console.log(`File size verified for ${fileName}`);
  } catch (error) {
    await rm(temporaryDestination, { force: true });
    console.log(`Error downloading ${fileName}`, error);
    throw error;
  }
}

function renameDesktopAsset(name) {
  const fileName = name.replace(latestDesktopVersion, 'latest').replace(latestDesktopVersionBase, 'latest');
  return fileName.replace(/^tidgi-latest-/, 'TidGi-latest-');
}

async function downloadAssetWithBackoff(asset, rename) {
  let retryCount = 0;
  await backOff(
    async () => {
      if (retryCount > 0) {
        console.log(`backoff retry ${asset.name} (count: ${retryCount})`);
      } else {
        console.log(`Start ${asset.name}`);
      }
      retryCount += 1;
      await downloadAsset(asset, rename);
    },
    { numOfAttempts: 10000, jitter: 'full' },
  );
}

let chunkCounter = 0;

await rm(downloadFolder, { recursive: true, force: true });
await mkdir(downloadFolder, { recursive: true });
await Promise.all([
  ...latestDesktopReleaseData.assets.map(async (asset) => {
    chunkCounter += 1;
    if (chunkCounter > latestDesktopReleaseData.assets.length / 2) {
      await Bluebird.delay(20000 * Math.random());
    } else {
      await Bluebird.delay(5000 * Math.random());
    }
    await downloadAssetWithBackoff(asset, renameDesktopAsset);
  }),
  ...latestMobileReleaseData.assets.map(async (asset) => {
    await Bluebird.delay(10000 * Math.random());
    await downloadAssetWithBackoff(asset, (name) => {
      const fileName = name.replace('app-release-signed', 'TidGi-Mobile');
      return fileName;
    });
  }),
]);
