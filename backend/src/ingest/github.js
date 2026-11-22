// Talks to GitHub: validates the URL, finds the latest commit, downloads the repo as one tarball.
import { Readable } from 'node:stream';
import { Parser } from 'tar';
import { classify, LIMITS } from './filter.js';

const API = 'https://api.github.com';

// fetch() that gives up after `ms` and explains what went wrong, instead of hanging forever.
async function fetchWithTimeout(url, options = {}, ms = 30000) {
  try {
    return await fetch(url, { ...options, signal: AbortSignal.timeout(ms) });
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      throw new Error(`GitHub did not respond within ${ms / 1000}s. Check your internet connection or VPN.`);
    }
    throw new Error(`Could not reach GitHub (${err.cause?.code || err.message}). Check your internet connection.`);
  }
}

function headers() {
  const h = { Accept: 'application/vnd.github+json', 'User-Agent': 'codemap-ai' };
  if (process.env.GITHUB_TOKEN) h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
}

export function parseRepoUrl(url) {
  const m = String(url).trim().match(/^https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i);
  if (!m) throw new Error('Please enter a URL like https://github.com/owner/repo');
  return { owner: m[1], repo: m[2] };
}

// One API call gives us the default branch; a second gives the latest commit SHA.
export async function getRepoInfo({ owner, repo }) {
  const res = await fetchWithTimeout(`${API}/repos/${owner}/${repo}`, { headers: headers() });
  if (res.status === 401) throw new Error('GITHUB_TOKEN is invalid or expired. Create a new one, or leave it empty.');
  if (res.status === 404) throw new Error('Repository not found (is it public?)');
  if (res.status === 403 || res.status === 429) {
    // Rate limited: we can still download the default branch from codeload, we just can't cache by commit SHA.
    console.warn('GitHub API rate limit hit - add GITHUB_TOKEN to .env. Falling back to HEAD.');
    return { owner, repo, branch: 'HEAD', sha: 'HEAD', description: null, stars: null };
  }
  if (!res.ok) throw new Error(`GitHub error ${res.status}`);
  const info = await res.json();

  const commitRes = await fetchWithTimeout(`${API}/repos/${owner}/${repo}/commits/${info.default_branch}`, { headers: headers() });
  if (!commitRes.ok) throw new Error(`GitHub error ${commitRes.status}`);
  const commit = await commitRes.json();

  return {
    owner, repo,
    branch: info.default_branch,
    sha: commit.sha,
    description: info.description,
    stars: info.stargazers_count
  };
}

// Downloads the whole repo as a single .tar.gz and keeps only the files we want.
export async function downloadFiles({ owner, repo, sha }) {
  // codeload.github.com serves the archive without using the REST API quota.
  const res = await fetchWithTimeout(`https://codeload.github.com/${owner}/${repo}/tar.gz/${sha}`, { headers: { 'User-Agent': 'codemap-ai' }, redirect: 'follow' }, 180000);
  if (!res.ok) throw new Error(`Could not download repo (${res.status})`);

  const files = [];
  const skipped = { ignored: 0, notCode: 0, tooBig: 0, limit: 0 };

  const parser = new Parser();
  parser.on('entry', (entry) => {
    if (entry.type !== 'File') return entry.resume();

    // Tarball paths start with "owner-repo-sha/", so drop the first folder.
    const path = entry.path.split('/').slice(1).join('/');
    const verdict = classify(path, entry.size);
    if (verdict !== 'keep') { skipped[verdict]++; return entry.resume(); }
    if (files.length >= LIMITS.maxFiles) { skipped.limit++; return entry.resume(); }

    const parts = [];
    entry.on('data', (c) => parts.push(c));
    entry.on('end', () => files.push({ path, size: entry.size, content: Buffer.concat(parts).toString('utf8') }));
  });

  await new Promise((resolve, reject) => {
    const body = Readable.fromWeb(res.body);
    body.on('error', (e) => reject(new Error(e.name === 'TimeoutError' || e.name === 'AbortError' ? 'Download took too long (over 3 minutes).' : `Download failed: ${e.message}`)));
    parser.on('error', reject);
    parser.on('end', resolve);
    body.pipe(parser);
  });

  files.sort((a, b) => a.path.localeCompare(b.path));
  return { files, skipped };
}
