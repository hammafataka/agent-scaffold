import { FieldSpec } from "../plugins/types";

export interface ResolveOptions {
  yes: boolean;
  ask: (field: FieldSpec) => Promise<string>;
}

export async function resolveFields(
  fields: FieldSpec[],
  opts: ResolveOptions,
): Promise<Record<string, string>> {
  const values: Record<string, string> = {};
  for (const field of fields) {
    if (opts.yes) {
      if (field.detectedValue !== undefined) {
        values[field.key] = field.detectedValue;
      } else if (field.required) {
        values[field.key] = await opts.ask(field);
      } else {
        values[field.key] = "";
      }
    } else {
      values[field.key] = await opts.ask(field);
    }
  }
  return values;
}
