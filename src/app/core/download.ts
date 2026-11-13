/** Hands the browser a file to save. Used for the winners export. */
export function downloadCsv(filename: string, contents: string): void {
  const blob = new Blob([contents], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** `raffle-winners-2026-11-13.csv` */
export function winnersFilename(): string {
  return `raffle-winners-${new Date().toISOString().slice(0, 10)}.csv`;
}
