// All calls to the backend live here. Repo "key" is always "owner/repo" in lowercase.
const json = async (res) => {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
};

export const parseGithubUrl = (url) => {
  const m = String(url).trim().match(/^https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i);
  return m ? `${m[1]}/${m[2]}`.toLowerCase() : null;
};

export const startIndexing = (url) =>
  fetch('/api/repos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) }).then(json);
export const listRepos = () => fetch('/api/repos').then(json);
export const getRepo = (key) => fetch(`/api/repos/${key}`).then(json);
export const getTree = (key) => fetch(`/api/repos/${key}/tree`).then(json);
export const getGraph = (key) => fetch(`/api/repos/${key}/graph`).then(json);
export const getFile = (key, path) => fetch(`/api/repos/${key}/file?path=${encodeURIComponent(path)}`).then(json);

// Streams the answer. `on` has optional handlers: retrieved, token, done, error.
export async function ask(key, question, history, on) {
  const res = await fetch(`/api/repos/${key}/ask`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question, history })
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Request failed (${res.status})`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const event = /^event: (.*)$/m.exec(block)?.[1];
      const data = /^data: (.*)$/m.exec(block)?.[1];
      if (event && data) on[event]?.(JSON.parse(data));
    }
  }
}
