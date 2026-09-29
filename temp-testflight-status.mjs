import crypto from "node:crypto";

const issuerId = requiredEnv("APPSTORE_CONNECT_ISSUER_ID");
const keyId = requiredEnv("APPSTORE_CONNECT_KEY_ID");
const privateKeyBase64 = requiredEnv("APPSTORE_CONNECT_PRIVATE_KEY_BASE64");
const bundleId = requiredEnv("PRODUCT_BUNDLE_IDENTIFIER");
const requestedBuild = process.env.TESTFLIGHT_BUILD_NUMBER?.trim() ?? "";
const testerSuffix = process.env.TESTFLIGHT_TESTER_SUFFIX?.trim() ?? "";
const baseUrl = "https://api.appstoreconnect.apple.com/v1";

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function base64url(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function createToken() {
  const now = Math.floor(Date.now() / 1_000);
  const header = base64url(JSON.stringify({
    alg: "ES256",
    kid: keyId,
    typ: "JWT"
  }));
  const payload = base64url(JSON.stringify({
    iss: issuerId,
    iat: now,
    exp: now + 600,
    aud: "appstoreconnect-v1"
  }));
  const signingInput = `${header}.${payload}`;
  const privateKey = Buffer.from(privateKeyBase64, "base64").toString("utf8");
  const signature = crypto.sign(
    "sha256",
    Buffer.from(signingInput),
    {
      key: privateKey,
      dsaEncoding: "ieee-p1363"
    }
  );
  return `${signingInput}.${base64url(signature)}`;
}

async function api(path, token) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json"
    }
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) {
    const message =
      body?.errors?.map((error) => error.detail || error.title).filter(Boolean)
        .join("; ")
      || `App Store Connect request failed with HTTP ${response.status}.`;
    throw new Error(message);
  }
  return body;
}

async function main() {
  const token = createToken();
  const apps = await api(
    `/apps?filter[bundleId]=${encodeURIComponent(bundleId)}&limit=10`,
    token
  );
  const app = apps.data?.[0];
  if (!app) {
    throw new Error(`No App Store Connect app found for ${bundleId}.`);
  }

  const builds = await api(
    [
      `/builds?filter[app]=${encodeURIComponent(app.id)}`,
      "sort=-uploadedDate",
      "limit=10",
      "fields[builds]=version,uploadedDate,expirationDate,expired,processingState"
    ].join("&"),
    token
  );
  const buildRows = [];
  for (const build of builds.data ?? []) {
    const groups = await api(
      [
        `/betaGroups?filter[builds]=${encodeURIComponent(build.id)}`,
        "limit=50",
        "fields[betaGroups]=name,isInternalGroup,publicLinkEnabled,createdDate"
      ].join("&"),
      token
    );
    const betaDetail = await api(
      `/builds/${build.id}/buildBetaDetail`,
      token
    );
    const assignedGroups = [];
    for (const group of groups.data ?? []) {
      const testers = testerSuffix
        ? await api(
            [
              `/betaGroups/${group.id}/betaTesters?limit=200`,
              "fields[betaTesters]=email,state,inviteType"
            ].join("&"),
            token
          )
        : { data: [] };
      const matchingTesterCount = testerSuffix
        ? (testers.data ?? []).filter((tester) => {
            const email = tester.attributes?.email ?? "";
            return email.includes(testerSuffix);
          }).length
        : null;
      assignedGroups.push({
        id: group.id,
        ...(group.attributes ?? {}),
        testerCount: testerSuffix ? (testers.data ?? []).length : null,
        matchingTesterCount
      });
    }
    buildRows.push({
      id: build.id,
      version: build.attributes?.version ?? null,
      processingState: build.attributes?.processingState ?? null,
      uploadedDate: build.attributes?.uploadedDate ?? null,
      expirationDate: build.attributes?.expirationDate ?? null,
      expired: build.attributes?.expired ?? null,
      betaDetail: betaDetail.data?.attributes ?? null,
      betaGroups: assignedGroups
    });
  }

  const matches = requestedBuild
    ? buildRows.filter((build) => build.version === requestedBuild)
    : buildRows.slice(0, 1);
  const result = {
    app: {
      id: app.id,
      bundleId: app.attributes?.bundleId ?? bundleId,
      name: app.attributes?.name ?? null
    },
    requestedBuild: requestedBuild || null,
    testerSuffixRequested: testerSuffix || null,
    foundRequestedBuild: requestedBuild ? matches.length > 0 : null,
    builds: matches.length > 0 ? matches : buildRows.slice(0, 5)
  };

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
