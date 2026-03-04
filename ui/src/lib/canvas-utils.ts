export async function decodeToBitmap(bytes: Uint8Array): Promise<ImageBitmap> {
  const blob = new Blob([bytes as BlobPart]);
  return createImageBitmap(blob);
}
