export async function getValidToken(cookieStr) {
  const clientToken = cookieStr.match(/__client=([^;]+)/)?.[1];
  if (!clientToken) {
    throw new Error("Token __client não encontrado no SUNO_COOKIE.");
  }

  const defaultHeaders = {
    'Authorization': clientToken,
    'Cookie': cookieStr,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Origin': 'https://suno.com',
    'Referer': 'https://suno.com/',
    'Accept': 'application/json, text/plain, */*'
  };

  // 1. Fetch Clerk client info to get the active session ID
  const getSessionUrl = 'https://auth.suno.com/v1/client?_clerk_js_version=5.117.0';
  const sessionResponse = await fetch(getSessionUrl, {
    headers: defaultHeaders
  });

  if (!sessionResponse.ok) {
    const txt = await sessionResponse.text();
    throw new Error(`Falha ao obter sessão do Clerk (${sessionResponse.status}): ${txt}`);
  }

  const sessionData = await sessionResponse.json();
  const sid = sessionData?.response?.last_active_session_id;
  if (!sid) {
    throw new Error("Não foi possível obter o last_active_session_id. O Clerk não retornou uma sessão ativa.");
  }

  // 2. Request a fresh JWT token for this session
  const renewUrl = `https://auth.suno.com/v1/client/sessions/${sid}/tokens?_clerk_js_version=5.117.0`;
  const renewResponse = await fetch(renewUrl, {
    method: 'POST',
    headers: defaultHeaders
  });

  if (!renewResponse.ok) {
    const txt = await renewResponse.text();
    throw new Error(`Falha ao renovar o token (${renewResponse.status}): ${txt}`);
  }

  const renewData = await renewResponse.json();
  const jwt = renewData.jwt;
  
  if (!jwt) {
    throw new Error("Não foi possível gerar novo token JWT (__session).");
  }

  return jwt;
}
