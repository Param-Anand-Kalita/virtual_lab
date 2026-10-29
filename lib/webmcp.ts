import { COMPONENTS, PART_IDS, type PartId } from './components-data';

type Snapshot = { selected: PartId | null; removed: PartId[]; hidden: PartId[]; explode: number; isolate: boolean; labels: boolean };
type Tool = { name: string; description: string; inputSchema: object; annotations: { readOnlyHint: boolean; untrustedContentHint: boolean }; execute: (input: unknown) => unknown };
type ModelContext = { registerTool: (tool: Tool, options?: { signal?: AbortSignal }) => void | Promise<void> };
function objectInput(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an input object.');
  return value as Record<string, unknown>;
}
export function makeLabTools(actions: { read: () => Snapshot; inspect: (id: PartId, isolate: boolean) => void; assemble: (spacing: number) => void }): Tool[] {
  return [
    { name: 'read_pc_lab', description: 'Read the visible computer assembly, selection and component descriptions.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: false }, execute(input) { if (Object.keys(objectInput(input)).length) throw new Error('This tool takes an empty object.'); return { ...actions.read(), components: COMPONENTS.map(({ id, name, role }) => ({ id, name, role })) }; } },
    { name: 'inspect_pc_component', description: 'Select a component in the 3D lab and optionally isolate it. Updates the visible model and teaching explanation.', inputSchema: { type: 'object', properties: { component: { type: 'string', enum: PART_IDS }, isolate: { type: 'boolean' } }, required: ['component'], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute(input) { const value = objectInput(input); if (Object.keys(value).some((key) => !['component', 'isolate'].includes(key)) || !PART_IDS.includes(value.component as PartId) || (value.isolate !== undefined && typeof value.isolate !== 'boolean')) throw new Error('Provide a valid component ID and an optional boolean isolate value.'); actions.inspect(value.component as PartId, value.isolate === true); return actions.read(); } },
    { name: 'set_pc_assembly_spacing', description: 'Reassemble individually removed parts and set exploded-view spacing from 0 (assembled) to 100 (fully separated). Exits guided disassembly and isolation.', inputSchema: { type: 'object', properties: { spacing: { type: 'number', minimum: 0, maximum: 100 } }, required: ['spacing'], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute(input) { const value = objectInput(input); if (Object.keys(value).some((key) => key !== 'spacing') || typeof value.spacing !== 'number' || !Number.isFinite(value.spacing) || value.spacing < 0 || value.spacing > 100) throw new Error('Spacing must be a number from 0 to 100.'); actions.assemble(value.spacing); return actions.read(); } },
  ];
}
export function registerLabTools(tools: Tool[]): () => void {
  const context = (document as Document & { modelContext?: ModelContext }).modelContext;
  if (!context?.registerTool) return () => {};
  const lifecycle = new AbortController();
  for (const tool of tools) {
    try { Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch((error) => console.warn('Optional WebMCP registration failed', error)); }
    catch (error) { console.warn('Optional WebMCP registration failed', error); }
  }
  return () => lifecycle.abort();
}
