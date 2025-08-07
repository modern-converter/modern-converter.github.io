export async function convertArchive(file, fmt){
  if(fmt==='tar-lite'){
    const header = new TextEncoder().encode(`TAR-LITE\nPlik:${file.name}\nRozmiar:${file.size}\nUtworzono:${new Date().toISOString()}\n\n`);
    const content = await file.arrayBuffer();
    return new Blob([header, content], {type:'application/x-tar'});
  }
  if(fmt==='zip-lite'){
    const header = new TextEncoder().encode(`ZIP-LITE\nPlik:${file.name}\nRozmiar:${file.size}\nUtworzono:${new Date().toISOString()}\n\n`);
    const content = await file.arrayBuffer();
    return new Blob([header, content], {type:'application/zip'});
  }
  return new Blob([await file.arrayBuffer()], {type:'application/octet-stream'});
}
