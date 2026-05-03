// このファイルを local-tool.config.js にコピーして設定してください。
window.LOCAL_PROBLEM_TOOL_CONFIG = {
  googleAuth: {
    // Google Cloud で作成した OAuth Client ID に差し替えます。
    clientId: "REPLACE_WITH_GOOGLE_OAUTH_CLIENT_ID",
    // 問題作成ツールを使えるGoogleアカウント。
    allowedEmails: ["teacher@example.com"]
  },
  gemini: {
    endpointBase: "https://generativelanguage.googleapis.com/v1beta",
    defaultModel: "gemini-2.5-flash"
  }
};
