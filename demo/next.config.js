export default {
  basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? "",
  assetPrefix: process.env.NEXT_PUBLIC_BASE_PATH ?? "",
  trailingSlash: true,
  agentRules: false,
  ...(!process.env.DEVELOPMENT && { output: "export" }),
}
