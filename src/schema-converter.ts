/**
 * schema-converter.ts — Convert reef pscale-native schemas to Zod shapes.
 *
 * Reef schema format:
 *   { "_": "Input schema",
 *     "1": { "_": "param_name", "1": "type", "2": "required"|"optional", "3": "description" },
 *     "2": { ... }
 *   }
 *
 * Output: ZodRawShape for server.tool() registration.
 */

import { z, type ZodTypeAny } from 'zod';

function reefTypeToZod(paramNode: Record<string, any>): ZodTypeAny {
  const typeName = paramNode['1'] || 'string';
  const required = paramNode['2'] === 'required';
  const description = paramNode['3'] || '';

  let zodType: ZodTypeAny;
  switch (typeName) {
    case 'string':  zodType = z.string(); break;
    case 'integer': zodType = z.number(); break;
    case 'number':  zodType = z.number(); break;
    case 'boolean': zodType = z.boolean(); break;
    case 'object':  zodType = z.record(z.string(), z.any()); break;
    case 'array':   zodType = z.array(z.any()); break;
    default:        zodType = z.string(); break;
  }

  if (description) zodType = zodType.describe(description);
  if (!required) zodType = zodType.optional();
  return zodType;
}

export function reefSchemaToZod(schemaNode: Record<string, any>): Record<string, ZodTypeAny> {
  const shape: Record<string, ZodTypeAny> = {};

  for (const key of '123456789') {
    if (!(key in schemaNode)) continue;
    const param = schemaNode[key];
    if (!param || typeof param !== 'object') continue;

    const paramName = param['_'];
    if (!paramName || typeof paramName !== 'string') continue;

    shape[paramName] = reefTypeToZod(param);
  }

  return shape;
}
