import fs from "node:fs";
import path from "node:path";

const inputPath = process.argv[2] ?? "public/model/model.json";
const absolutePath = path.resolve(inputPath);

if (!fs.existsSync(absolutePath)) {
  console.error(`Model not found: ${absolutePath}`);
  process.exit(1);
}

const model = JSON.parse(fs.readFileSync(absolutePath, "utf8"));
const nodes = model?.modelTopology?.node;

if (!Array.isArray(nodes)) {
  console.error(
    "modelTopology.node was not found. This is not a supported TensorFlow.js GraphModel.",
  );
  process.exit(1);
}

const decodeBase64 = (value) =>
  Buffer.from(value, "base64").toString("utf8");

const encodeBase64 = (value) =>
  Buffer.from(value, "utf8").toString("base64");

const existingNames = new Set(nodes.map((node) => node.name));
const replacements = new Map();
const newNodes = [];

for (const node of nodes) {
  if (node.op !== "FusedMatMul" && node.op !== "_FusedMatMul") {
    continue;
  }

  const fusedOpsAttr = node.attr?.fusedOps ?? node.attr?.fused_ops;
  const encodedOps = fusedOpsAttr?.list?.s;

  if (!Array.isArray(encodedOps)) {
    continue;
  }

  const decodedOps = encodedOps.map(decodeBase64);

  if (!decodedOps.includes("Tanh")) {
    continue;
  }

  const remainingOps = decodedOps.filter((operation) => operation !== "Tanh");
  fusedOpsAttr.list.s = remainingOps.map(encodeBase64);

  let tanhName = `${node.name}/UnfusedTanh`;
  let suffix = 1;

  while (existingNames.has(tanhName)) {
    tanhName = `${node.name}/UnfusedTanh_${suffix++}`;
  }

  existingNames.add(tanhName);
  replacements.set(node.name, tanhName);

  newNodes.push({
    name: tanhName,
    op: "Tanh",
    input: [node.name],
    attr: {
      T: node.attr?.T ?? { type: "DT_FLOAT" },
    },
  });
}

if (replacements.size === 0) {
  console.error(
    "No FusedMatMul/_FusedMatMul operation with fused Tanh was found.",
  );
  process.exit(2);
}

// Only rewrite consumers from the original graph.
// The newly added Tanh nodes must continue consuming the original MatMul node.
for (const node of nodes) {
  if (!Array.isArray(node.input)) {
    continue;
  }

  node.input = node.input.map((input) => {
    const isControlDependency = input.startsWith("^");
    const withoutControlPrefix = isControlDependency ? input.slice(1) : input;

    const separatorIndex = withoutControlPrefix.lastIndexOf(":");
    const hasOutputIndex =
      separatorIndex > -1 &&
      /^\d+$/.test(withoutControlPrefix.slice(separatorIndex + 1));

    const baseName = hasOutputIndex
      ? withoutControlPrefix.slice(0, separatorIndex)
      : withoutControlPrefix;

    const outputSuffix = hasOutputIndex
      ? withoutControlPrefix.slice(separatorIndex)
      : "";

    const replacement = replacements.get(baseName);

    if (!replacement) {
      return input;
    }

    return `${isControlDependency ? "^" : ""}${replacement}${outputSuffix}`;
  });
}

nodes.push(...newNodes);

const backupPath = `${absolutePath}.before-unfuse-tanh`;

if (!fs.existsSync(backupPath)) {
  fs.copyFileSync(absolutePath, backupPath);
}

fs.writeFileSync(absolutePath, `${JSON.stringify(model)}\n`, "utf8");

console.log(`Patched: ${absolutePath}`);
console.log(`Backup:  ${backupPath}`);
console.log(
  `Unfused ${replacements.size} FusedMatMul/_FusedMatMul + Tanh operation(s).`,
);
