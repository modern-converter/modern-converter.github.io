export async function convertCode(file, fmt){
  const text = await tryReadText(file);
  if(fmt==='json'){
    try{
      const obj = JSON.parse(text);
      return new Blob([JSON.stringify(obj, null, 2)], {type:'application/json'});
    }catch{
      return new Blob([JSON.stringify({raw:text})], {type:'application/json'});
    }
  }
  if(fmt==='csv'){
    const lines = text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
    const csv = lines.map(l => l.split(/\s+/).map(cell => /[",\n]/.test(cell)?('"'+cell.replace(/"/g,'""')+'"'):cell).join(',')).join('\n');
    return new Blob([csv], {type:'text/csv'});
  }
  if(fmt==='ndjson-lite'){
    const lines = text.split(/\r?\n/).filter(Boolean).map((v,i)=>({i, value:v}));
    const out = lines.map(obj=>JSON.stringify(obj)).join('\n');
    return new Blob([out], {type:'application/x-ndjson'});
  }
  return new Blob([text], {type:'text/plain'});
}

/* helper imported here to avoid circular dependency */
async function tryReadText(file){
  try{ return await file.text(); }
  catch{
    const buf = await file.arrayBuffer();
    try{ return new TextDecoder().decode(buf); }
    catch{ return '[dane binarne]'; }
  }
}
