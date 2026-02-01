#!/usr/bin/env bun

import { $ } from "bun"
import { readFile } from "fs/promises"
import { join } from "path"
import { parseArgs } from "util"

const { values: args } = parseArgs({
  args: process.argv.slice(2),
  options: {
    apply: { type: "boolean", short: "u", default: false },
    verbose: { type: "boolean", short: "v", default: false },
  },
})

const ROOT = process.cwd()
const WORKSPACE_DIRS = ["types", "lib", "demo"]
const COOLDOWN_DAYS = 3

interface UpdateInfo {
  from: string
  to: string
  packages: string[]
}

async function findPackageDirs(): Promise<{ path: string; name: string }[]> {
  const dirs: { path: string; name: string }[] = [{ path: ROOT, name: "root" }]

  for (const dir of WORKSPACE_DIRS) {
    const pkgPath = join(ROOT, dir)
    try {
      const pkgJson = JSON.parse(await readFile(join(pkgPath, "package.json"), "utf-8"))
      dirs.push({
        path: pkgPath,
        name: pkgJson.name?.replace("@cs124/", "") || dir,
      })
    } catch {
      // Directory doesn't exist or no package.json, skip
    }
  }

  return dirs
}

async function getPackageVersions(dir: string): Promise<Record<string, string>> {
  try {
    const pkgJson = JSON.parse(await readFile(join(dir, "package.json"), "utf-8"))
    return {
      ...pkgJson.dependencies,
      ...pkgJson.devDependencies,
      ...pkgJson.peerDependencies,
      ...pkgJson.optionalDependencies,
    }
  } catch {
    return {}
  }
}

async function runNcu(dir: string, apply: boolean, skipCooldown: boolean = false): Promise<Record<string, string>> {
  try {
    const packageFile = join(dir, "package.json")
    const args = ["--jsonUpgraded", "--packageFile", packageFile]
    if (apply) args.push("-u")
    if (skipCooldown) args.push("--cooldown", "0")

    const result = await $`ncu ${args}`.quiet()
    const output = result.text().trim()
    if (!output || output === "{}") return {}
    return JSON.parse(output)
  } catch {
    return {}
  }
}

async function main() {
  const dirs = await findPackageDirs()
  const updates = new Map<string, UpdateInfo>()
  const cooldownUpdates = new Map<string, UpdateInfo>()

  console.log(args.apply ? "\nApplying dependency updates...\n" : "\nChecking for dependency updates...\n")

  if (args.verbose) {
    console.log(`  Cooldown: ${COOLDOWN_DAYS} days (configured in .ncurc.js)`)
    console.log(`  Scanning ${dirs.length} packages: ${dirs.map((d) => d.name).join(", ")}\n`)
  }

  // Run ncu on all packages and collect results
  for (const { path, name } of dirs) {
    if (args.verbose) {
      process.stdout.write(`  Checking ${name}...`)
    }

    const currentVersions = await getPackageVersions(path)
    const result = await runNcu(path, args.apply)
    const resultCount = Object.keys(result).length

    if (args.verbose) {
      console.log(resultCount > 0 ? ` ${resultCount} update(s)` : " up to date")
    }

    for (const [dep, toVersion] of Object.entries(result)) {
      const fromVersion = currentVersions[dep]
      // Skip if we can't determine current version
      if (!fromVersion || !toVersion) continue

      const key = `${dep}:${fromVersion}:${toVersion}`
      const existing = updates.get(key)
      if (existing) {
        existing.packages.push(name)
      } else {
        updates.set(key, {
          from: fromVersion,
          to: toVersion,
          packages: [name],
        })
      }
    }

    // In verbose mode, also check for updates blocked by cooldown
    if (args.verbose && !args.apply) {
      const allUpdates = await runNcu(path, false, true)
      for (const [dep, toVersion] of Object.entries(allUpdates)) {
        const fromVersion = currentVersions[dep]
        if (!fromVersion || !toVersion) continue
        const key = `${dep}:${fromVersion}:${toVersion}`
        // If this update isn't in the main results, it's blocked by cooldown
        if (!updates.has(key)) {
          const existing = cooldownUpdates.get(key)
          if (existing) {
            existing.packages.push(name)
          } else {
            cooldownUpdates.set(key, {
              from: fromVersion,
              to: toVersion,
              packages: [name],
            })
          }
        }
      }
    }
  }

  if (args.verbose) {
    console.log()
  }

  if (updates.size === 0 && cooldownUpdates.size === 0) {
    console.log("All dependencies are up to date.\n")
    return
  }

  // Sort available updates by dependency name
  const sorted = Array.from(updates.entries()).sort((a, b) => {
    const [keyA] = a
    const [keyB] = b
    const depA = keyA.split(":")[0]
    const depB = keyB.split(":")[0]
    return depA.localeCompare(depB)
  })

  // Display results
  const action = args.apply ? "Updated" : "Available"
  console.log(`${action} updates:\n`)

  for (const [key, info] of sorted) {
    const dep = key.split(":")[0]
    const pkgList = info.packages.join(", ")
    console.log(`  \x1b[33m${dep.padEnd(40)}\x1b[0m ${info.from.padEnd(15)} → \x1b[32m${info.to}\x1b[0m`)
    console.log(`    \x1b[90m[${pkgList}]\x1b[0m`)
  }

  if (updates.size > 0) {
    console.log(`\n  Total: ${updates.size} update(s) ready to apply\n`)
  }

  // Show updates blocked by cooldown in verbose mode
  if (args.verbose && cooldownUpdates.size > 0) {
    const sortedCooldown = Array.from(cooldownUpdates.entries()).sort((a, b) => {
      const depA = a[0].split(":")[0]
      const depB = b[0].split(":")[0]
      return depA.localeCompare(depB)
    })

    console.log(`\x1b[90mUpdates in cooldown (< ${COOLDOWN_DAYS} days old):\x1b[0m\n`)

    for (const [key, info] of sortedCooldown) {
      const dep = key.split(":")[0]
      const pkgList = info.packages.join(", ")
      console.log(`  \x1b[90m${dep.padEnd(40)} ${info.from.padEnd(15)} → ${info.to}\x1b[0m`)
      console.log(`    \x1b[90m[${pkgList}]\x1b[0m`)
    }

    console.log(`\n  \x1b[90m${cooldownUpdates.size} update(s) waiting for cooldown\x1b[0m\n`)
  }

  if (!args.apply) {
    console.log("  Run with --apply (-u) to apply updates.")
    if (!args.verbose) {
      console.log("  Run with --verbose (-v) for more details.\n")
    } else {
      console.log()
    }
  } else {
    console.log("  Running 'bun install' to install updated dependencies...\n")
    await $`bun install`
  }
}

main().catch(console.error)
