import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'https://piqxyfmzzywxzqkzmpmm.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

let client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (!client) {
    if (!supabaseKey) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');
    }
    client = createClient(supabaseUrl, supabaseKey);
  }
  return client;
}

export interface BlockRow {
  id: string;
  owner_id: string;
  name: string;
  block_type: string;
  block: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export async function getBlock(ownerId: string, name: string): Promise<BlockRow | null> {
  const { data, error } = await getClient()
    .from('pscale_blocks')
    .select('*')
    .eq('owner_id', ownerId)
    .eq('name', name)
    .single();

  if (error && error.code === 'PGRST116') return null; // not found
  if (error) throw new Error(`DB error: ${error.message}`);
  return data as BlockRow;
}

export async function upsertBlock(
  ownerId: string,
  name: string,
  blockType: string,
  block: Record<string, any>,
): Promise<BlockRow> {
  const { data, error } = await getClient()
    .from('pscale_blocks')
    .upsert(
      {
        owner_id: ownerId,
        name,
        block_type: blockType,
        block,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'owner_id,name' },
    )
    .select()
    .single();

  if (error) throw new Error(`DB error: ${error.message}`);
  return data as BlockRow;
}

export async function listBlocks(
  ownerId: string,
  blockType?: string,
): Promise<BlockRow[]> {
  let query = getClient()
    .from('pscale_blocks')
    .select('*')
    .eq('owner_id', ownerId);

  if (blockType) {
    query = query.eq('block_type', blockType);
  }

  const { data, error } = await query.order('updated_at', { ascending: false });
  if (error) throw new Error(`DB error: ${error.message}`);
  return (data || []) as BlockRow[];
}
