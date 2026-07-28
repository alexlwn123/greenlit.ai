import { assessSoc2Readiness, readinessLines } from "./lib/soc2-readiness.mjs"

const assessment = await assessSoc2Readiness()
console.log(readinessLines(assessment).join("\n"))
if (!assessment.ready) process.exitCode = 2
