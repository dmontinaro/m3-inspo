/** The version the server reports in MCP `serverInfo`: the Railway deploy commit, or a dev marker. */
export const SERVER_VERSION: string = process.env.RAILWAY_GIT_COMMIT_SHA
  ? `m3-inspo-${process.env.RAILWAY_GIT_COMMIT_SHA.slice(0, 7)}`
  : "0.0.0-dev";
