import crypto from "node:crypto";
const issuerId = process.env.APPSTORE_CONNECT_ISSUER_ID;
const keyId = process.env.APPSTORE_CONNECT_KEY_ID;
const privateKeyBase64 = process.env.APPSTORE_CONNECT_PRIVATE_KEY_BASE64;
const bundleId = process.env.PRODUCT_BUNDLE_IDENTIFIER;
const baseUrl = "https://api.appstoreconnect.apple.com/v1";
const base64url = (value) => Buffer.from(value).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
const now = Math.floor(Date.now() / 1000);
const header = base64url(JSON.stringify({ alg: "ES256", kid: keyId, typ: "JWT" }));
const payload = base64url(JSON.stringify({ iss: issuerId, iat: now, exp: now + 600, aud: "appstoreconnect-v1" }));
const signingInput = `${header}.${payload}`;
const signature = crypto.sign("sha256", Buffer.from(signingInput), { key: Buffer.from(privateKeyBase64, "base64").toString("utf8"), dsaEncoding: "ieee-p1363" });
const token = `${signingInput}.${base64url(signature)}`;
async function api(path) {
  const response = await fetch(`${baseUrl}${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
  const body = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(body));
  return body;
}
const apps = await api(`/apps?filter[bundleId]=${encodeURIComponent(bundleId)}&limit=1`);
const app = apps.data?.[0];
if (!app) throw new Error("App not found");
const uploads = await api(`/apps/${app.id}/buildUploads?sort=-uploadedDate&limit=5&fields[buildUploads]=cfBundleShortVersionString,cfBundleVersion,createdDate,state,platform,uploadedDate,build`);
const builds = await api(`/builds?filter[app]=${encodeURIComponent(app.id)}&sort=-uploadedDate&limit=5&fields[builds]=version,uploadedDate,processingState,expired`);
process.stdout.write(`${JSON.stringify({ uploads: uploads.data, builds: builds.data }, null, 2)}\n`);