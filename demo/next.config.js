module.exports = {
  basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? "",
  assetPrefix: process.env.NEXT_PUBLIC_BASE_PATH ?? "",
  trailingSlash: true,
  ...(!process.env.DEVELOPMENT && { output: "export" }),
}
