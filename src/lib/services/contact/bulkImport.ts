import Papa from "papaparse";

/**
 * Streams a large contact CSV into the server in batches.
 *
 * A browser can read a hundred-megabyte file without trouble; a serverless
 * request cannot receive one. So the parsing happens here, in the tab, and only
 * small batches of already-parsed rows cross the network. That is what makes a
 * ten-lakh import possible: the file never has to fit in a request body, and no
 * single request has to finish the job before the platform kills it at sixty
 * seconds.
 *
 * PapaParse reads the file as a stream, so memory stays flat whatever the file
 * size — the whole thing is never held at once.
 */

/** Rows per request. Matches the ceiling the import endpoint enforces. */
const BATCH_SIZE = 2_000;

export interface ImportProgress {
  /** Rows read from the file so far. */
  processed: number;
  /** Rows the server actually stored. */
  imported: number;
  /** Rows with no name, email or phone, which are not contacts. */
  skipped: number;
  /** Total rows, once known. Null while still reading. */
  total: number | null;
  /** Whole percent, or null when the total is not yet known. */
  percent: number | null;
}

export interface ImportOutcome extends ImportProgress {
  cancelled: boolean;
  error: string | null;
}

/**
 * Reads `file` and sends it to the campaign in batches.
 *
 * `onProgress` is called after every batch so the caller can draw a bar; the
 * returned promise settles when the file is exhausted.
 */
export async function importContactsFromFile(options: {
  file: File;
  campaignId: string;
  onProgress?: (progress: ImportProgress) => void;
  /** Checked between batches so a long import can be stopped. */
  shouldCancel?: () => boolean;
}): Promise<ImportOutcome> {
  const { file, campaignId, onProgress, shouldCancel } = options;

  let processed = 0;
  let imported = 0;
  let skipped = 0;
  let cancelled = false;
  let error: string | null = null;

  // Estimated from the file size and the first rows seen, so the bar can move
  // before the file has been fully read. Refined as parsing proceeds.
  let estimatedTotal: number | null = null;
  let bytesPerRow = 0;

  const report = () => {
    const total = estimatedTotal;
    onProgress?.({
      processed,
      imported,
      skipped,
      total,
      percent: total ? Math.min(99, Math.floor((processed / total) * 100)) : null,
    });
  };

  const sendBatch = async (rows: Array<Record<string, string>>, startIndex: number, final: boolean) => {
    if (!rows.length) return;
    const res = await fetch(`/api/client/campaigns/${campaignId}/import-csv`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows, startIndex, final }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.success === false) {
      throw new Error(json?.error?.message || `Import failed at row ${startIndex + 1}.`);
    }
    imported += json.data?.imported ?? 0;
    skipped += json.data?.skipped ?? 0;
  };

  await new Promise<void>((resolve) => {
    let buffer: Array<Record<string, string>> = [];
    let startIndex = 0;

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      // Streaming: PapaParse hands back a chunk at a time rather than building
      // one enormous array, so a 100 MB file does not sit in memory.
      chunkSize: 1024 * 1024,
      chunk: async (results, parser) => {
        if (shouldCancel?.()) {
          cancelled = true;
          parser.abort();
          resolve();
          return;
        }

        // Pause while the batch is in flight, or PapaParse races ahead and the
        // buffer grows without bound on a fast disk and a slow network.
        parser.pause();

        buffer.push(...results.data);
        processed += results.data.length;

        if (!bytesPerRow && processed > 0 && results.meta.cursor) {
          bytesPerRow = results.meta.cursor / processed;
          estimatedTotal = Math.max(processed, Math.round(file.size / bytesPerRow));
        }

        try {
          while (buffer.length >= BATCH_SIZE) {
            const batch = buffer.slice(0, BATCH_SIZE);
            buffer = buffer.slice(BATCH_SIZE);
            await sendBatch(batch, startIndex, false);
            startIndex += batch.length;
            report();
          }
          parser.resume();
        } catch (e: any) {
          error = e?.message || "Import failed.";
          parser.abort();
          resolve();
        }
      },
      complete: async () => {
        if (cancelled || error) {
          resolve();
          return;
        }
        try {
          // Whatever is left, plus the marker that tells the server this was
          // the last batch so it writes one audit entry rather than hundreds.
          await sendBatch(buffer, startIndex, true);
          estimatedTotal = processed;
          report();
        } catch (e: any) {
          error = e?.message || "Import failed.";
        }
        resolve();
      },
      error: (e) => {
        error = e?.message || "Could not read that file.";
        resolve();
      },
    });
  });

  return {
    processed,
    imported,
    skipped,
    total: estimatedTotal,
    percent: error || cancelled ? null : 100,
    cancelled,
    error,
  };
}
