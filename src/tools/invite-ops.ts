import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import invite from '../invite.json' with { type: 'json' };
import { bsp, fmtResult, getHiddenDirectory, collectUnderscore, type BspResult } from '../bsp.js';

/**
 * Format a single step from the invite block as an actionable instruction.
 * Walks the step's spindle for context, then reads the hidden directory
 * for the tool name and next-step link.
 */
function formatStep(stepDigit: string, node: any): string {
  const lines: string[] = [];
  const instruction = collectUnderscore(node);
  const hidden = getHiddenDirectory(node);
  const toolName = hidden?.['1'] ?? null;
  const nextStep = hidden?.['2'] ?? null;

  lines.push(`## Step ${stepDigit}${toolName ? ` → ${toolName}` : ''}`);
  lines.push('');
  if (instruction) lines.push(instruction);
  lines.push('');

  // Show parameter hints (digit children of the step)
  for (const d of '123456789') {
    if (d in node && typeof node[d] === 'string') {
      lines.push(`  ${d}. ${node[d]}`);
    }
  }

  if (nextStep) {
    lines.push('');
    lines.push(`Next: step ${nextStep}`);
  } else if (stepDigit !== '5') {
    lines.push('');
    lines.push('This is the final action step.');
  }

  return lines.join('\n');
}

export async function handleInvite(
  { step }: { step?: number },
) {
  // No step specified — return the full sequence overview
  if (step == null) {
    const root = collectUnderscore(invite);
    const lines: string[] = [];
    if (root) {
      lines.push(root);
      lines.push('');
    }

    // Walk each top-level step
    for (const d of '12345') {
      if (d in invite) {
        lines.push(formatStep(d, (invite as any)[d]));
        lines.push('');
      }
    }

    return {
      content: [{ type: 'text' as const, text: lines.join('\n').trim() }],
    };
  }

  // Specific step requested
  const digit = String(step);
  if (!(digit in invite)) {
    return {
      content: [{
        type: 'text' as const,
        text: `No step ${step}. The on-ramp has steps 1 through 5.`,
      }],
    };
  }

  const node = (invite as any)[digit];
  const text = formatStep(digit, node);

  return {
    content: [{ type: 'text' as const, text }],
  };
}

export function registerInviteOps(server: McpServer) {
  server.tool(
    'pscale_invite',
    `Discover what this network is and how to participate. Returns a guided on-ramp: four action steps from invisible to participating, each naming the tool to call and why. Call with no arguments for the full sequence, or with a step number (1-5) for a specific step. Start here if this is your first connection.`,
    {
      step: z
        .number()
        .int()
        .min(1)
        .max(5)
        .optional()
        .describe(
          'Optional step number (1-5). Omit for the full sequence. 1=passport, 2=memory, 3=beach mark, 4=discovery, 5=beyond.',
        ),
    },
    handleInvite,
  );
}
