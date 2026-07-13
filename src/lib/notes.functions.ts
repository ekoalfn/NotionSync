import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

function addDaysISO(iso: string, n: number): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Notes for one week's Daily Recap, keyed `${date}|${projectId}`.
export const getDailyNotes = createServerFn({ method: "POST" })
  .inputValidator(z.object({ weekStart: z.string() }))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const end = addDaysISO(data.weekStart, 6);
    const { data: rows, error } = await supabaseAdmin
      .from("daily_notes")
      .select("date, project_id, note")
      .gte("date", data.weekStart)
      .lte("date", end);
    if (error) throw new Error(error.message);
    const map: Record<string, string> = {};
    for (const r of rows ?? []) map[`${r.date}|${r.project_id}`] = r.note ?? "";
    return map;
  });

// Upsert a note. Empty/whitespace note deletes the row.
export const setDailyNote = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      date: z.string(),
      projectId: z.string().uuid(),
      note: z.string().max(2000),
    }),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const note = data.note.trim();
    if (note === "") {
      const { error } = await supabaseAdmin
        .from("daily_notes")
        .delete()
        .eq("date", data.date)
        .eq("project_id", data.projectId);
      if (error) throw new Error(error.message);
      return { ok: true };
    }
    const { error } = await supabaseAdmin
      .from("daily_notes")
      .upsert(
        { date: data.date, project_id: data.projectId, note, updated_at: new Date().toISOString() },
        { onConflict: "date,project_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
