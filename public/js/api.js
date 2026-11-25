// Every call to the REST API goes through here. JWT travels in an httpOnly cookie,
// so the browser sends it automatically — no token in localStorage.
export async function api(path, { method = 'GET', body, form, version = 'v1' } = {}) {
  const opts = { method, credentials: 'same-origin', headers: {} };
  if (form) opts.body = form;
  else if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const res = await fetch(`/api/${version}${path}`, opts);
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error?.message || `Request failed (${res.status})`);
    err.status = res.status;
    err.details = data?.error?.details;
    throw err;
  }
  return data;
}
