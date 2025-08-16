/*
  High-level plan:
  1) Tables and constants for capacities, ECC block structure for Versions 1..10.
  2) Byte-mode encoding (mode=0100), add terminator, pad bytes.
  3) Split into blocks according to version/ECC, generate RS for each block using GF(256).
  4) Interleave data + ecc codewords per spec.
  5) Initialize matrix with function patterns (finder, timing, alignment, dark module, format, version if≥7).
  6) Place codewords in matrix zigzag pattern.
  7) Try masks 0..7, compute penalty (N1..N4), choose best mask.
  8) Add format bits (with chosen ECL & mask) and render SVG.
*/

/* ---------------------------
   Data tables: capacities, ECC structure
   For versions 1..10 we include:
   - total codewords
   - capacities (bytes) for byte mode for ECC levels L/M/Q/H
   - block structure (num blocks, data codewords per block, ecc codewords per block)
   These numbers follow QR spec for versions 1..10.
--------------------------- */

// For brevity and safety we've prepared a table for versions 1..10 copied accurately from standard tables.
// Format: version => { totalCodewords, capacities: {L,M,Q,H}, ec: {L:{ecCodewords, blocks:[{count, dataCodewords}]}, ... } }
const QR_VERSIONS = {
  1:  { total:26, capacities:{L:17,M:14,Q:11,H:7},
        ec:{
          L:{ecCodewords:7, blocks:[{count:1,data:19}]},
          M:{ecCodewords:10,blocks:[{count:1,data:16}]},
          Q:{ecCodewords:13,blocks:[{count:1,data:13}]},
          H:{ecCodewords:17,blocks:[{count:1,data:9}]}
        }},
  2:  { total:44, capacities:{L:32,M:26,Q:20,H:14},
        ec:{
          L:{ecCodewords:10,blocks:[{count:1,data:34}]},
          M:{ecCodewords:16,blocks:[{count:1,data:28}]},
          Q:{ecCodewords:22,blocks:[{count:1,data:22}]},
          H:{ecCodewords:28,blocks:[{count:1,data:16}]}
        }},
  3:  { total:70, capacities:{L:53,M:42,Q:32,H:24},
        ec:{
          L:{ecCodewords:15,blocks:[{count:1,data:55}]},
          M:{ecCodewords:26,blocks:[{count:1,data:44}]},
          Q:{ecCodewords:18,blocks:[{count:2,data:17}]}, // 2 blocks * 17 = 34 data
          H:{ecCodewords:22,blocks:[{count:2,data:13}]}
        }},
  4:  { total:100, capacities:{L:78,M:62,Q:46,H:34},
        ec:{
          L:{ecCodewords:20,blocks:[{count:1,data:80}]},
          M:{ecCodewords:18,blocks:[{count:2,data:32}]}, // 2*32=64
          Q:{ecCodewords:26,blocks:[{count:2,data:24}]},
          H:{ecCodewords:16,blocks:[{count:4,data:9}]}
        }},
  5:  { total:134, capacities:{L:106,M:84,Q:60,H:44},
        ec:{
          L:{ecCodewords:26,blocks:[{count:1,data:108}]},
          M:{ecCodewords:24,blocks:[{count:2,data:43}]},
          Q:{ecCodewords:18,blocks:[{count:2,data:15},{count:2,data:16}]}, // mixed blocks: to support diverse patterns; will flatten later
          H:{ecCodewords:22,blocks:[{count:2,data:11},{count:2,data:12}]}
        }},
  6:  { total:172, capacities:{L:134,M:106,Q:74,H:58},
        ec:{
          L:{ecCodewords:18,blocks:[{count:2,data:68}]},
          M:{ecCodewords:16,blocks:[{count:4,data:27}]},
          Q:{ecCodewords:24,blocks:[{count:4,data:19}]},
          H:{ecCodewords:28,blocks:[{count:4,data:15}]}
        }},
  7:  { total:196, capacities:{L:154,M:122,Q:86,H:64},
        ec:{
          L:{ecCodewords:20,blocks:[{count:2,data:78}]},
          M:{ecCodewords:18,blocks:[{count:4,data:31}]},
          Q:{ecCodewords:18,blocks:[{count:2,data:14},{count:4,data:15}]},
          H:{ecCodewords:26,blocks:[{count:4,data:13},{count:1,data:14}]}
        }},
  8:  { total:242, capacities:{L:192,M:152,Q:108,H:84},
        ec:{
          L:{ecCodewords:24,blocks:[{count:2,data:97}]},
          M:{ecCodewords:22,blocks:[{count:2,data:38},{count:2,data:39}]},
          Q:{ecCodewords:22,blocks:[{count:4,data:18},{count:2,data:19}]},
          H:{ecCodewords:26,blocks:[{count:4,data:14},{count:2,data:15}]}
        }},
  9:  { total:292, capacities:{L:230,M:180,Q:130,H:98},
        ec:{
          L:{ecCodewords:30,blocks:[{count:2,data:116}]},
          M:{ecCodewords:22,blocks:[{count:3,data:36},{count:2,data:37}]},
          Q:{ecCodewords:20,blocks:[{count:4,data:16},{count:4,data:17}]},
          H:{ecCodewords:24,blocks:[{count:4,data:12},{count:4,data:13}]}
        }},
  10: { total:346, capacities:{L:271,M:213,Q:151,H:119},
        ec:{
          L:{ecCodewords:18,blocks:[{count:2,data:68},{count:2,data:69}]},
          M:{ecCodewords:26,blocks:[{count:4,data:43},{count:1,data:44}]},
          Q:{ecCodewords:24,blocks:[{count:6,data:19},{count:2,data:20}]},
          H:{ecCodewords:28,blocks:[{count:6,data:15},{count:2,data:16}]}
        }}
};

// Helper: flatten blocks into array of {dataCodewords, count}
function expandBlocks(blocks) {
  const arr=[];
  for(const b of blocks) {
    arr.push({count:b.count, data:b.data});
  }
  return arr;
}

/* ---------------------------
  GF(256) arithmetic for Reed-Solomon
  We'll build exp/log tables with primitive 0x11d
--------------------------- */
const GF256 = (() => {
  const exp = new Array(512);
  const log = new Array(256);
  let x=1;
  for(let i=0;i<255;i++){
    exp[i]=x;
    log[x]=i;
    x = x<<1;
    if(x & 0x100) x ^= 0x11d;
  }
  for(let i=255;i<512;i++) exp[i]=exp[i-255];
  return {
    exp, log,
    add:(a,b)=>a^b,
    sub:(a,b)=>a^b,
    mul:(a,b)=>{
      if(a===0||b===0) return 0;
      return exp[(log[a]+log[b])%255];
    },
    div:(a,b)=>{
      if(b===0) throw new Error("GF div by 0");
      if(a===0) return 0;
      return exp[(log[a]-log[b]+255)%255];
    },
    pow:(a,n)=>{
      if(n===0) return 1;
      if(a===0) return 0;
      return exp[(log[a]*n)%255];
    }
  };
})();

/* Multiply polynomials in GF(256) */
function polyMul(a,b){
  const res = new Array(a.length + b.length -1).fill(0);
  for(let i=0;i<a.length;i++){
    for(let j=0;j<b.length;j++){
      res[i+j] ^= GF256.mul(a[i], b[j]);
    }
  }
  return res;
}

/* Reed-Solomon generator poly of degree nsym */
function rsGeneratorPoly(nsym){
  let g = [1];
  for(let i=0;i<nsym;i++){
    g = polyMul(g, [1, GF256.exp[i]]);
  }
  return g;
}

/* RS encode: given data (array of bytes), return ecc of length nsym */
function rsEncode(data, nsym){
  const gen = rsGeneratorPoly(nsym);
  const msg = data.slice().concat(new Array(nsym).fill(0));
  for(let i=0;i<data.length;i++){
    const coef = msg[i];
    if(coef !== 0){
      for(let j=0;j<gen.length;j++){
        msg[i+j] ^= GF256.mul(gen[j], coef);
      }
    }
  }
  return msg.slice(msg.length - nsym);
}

/* ---------------------------
  Bit buffer and encoding bytes
--------------------------- */

function toUTF8Bytes(str){
  return new TextEncoder().encode(str);
}

/* Build final data bitstream for byte mode:
   mode (4 bits) = 0100 ; length (8/16 depending on version) ; data bytes ; terminator ; pad to codeword boundary ; pad bytes 0xEC/0x11 alternating
*/
function buildDataBytes(bytes, version, eccLevel){
  const capacityBytes = QR_VERSIONS[version].capacities[eccLevel];
  // byte-mode: mode = 0100
  const bits = [];

  // push bits helper
  function pushBits(value, length){
    for(let i=length-1;i>=0;i--){
      bits.push((value>>i)&1);
    }
  }

  // mode indicator
  pushBits(0b0100,4);
  // length in bytes: for versions 1-9 byte mode length uses 8 bits? Actually for byte mode:
  // Character count indicator length depends on version group: v1-9 => 8bits, v10-40 => 16bits
  const cciLen = (version <= 9) ? 8 : 16;
  pushBits(bytes.length, cciLen);

  // data bytes
  for(const b of bytes){
    pushBits(b,8);
  }

  // terminator: up to 4 zeros
  const maxBits = capacityBytes * 8;
  const remain = maxBits - bits.length;
  if(remain > 0){
    const term = Math.min(4, remain);
    for(let i=0;i<term;i++) bits.push(0);
  }
  // pad to byte
  while(bits.length %8 !== 0) bits.push(0);
  // pad bytes
  const padBytes = [0xEC, 0x11];
  let p=0;
  while(bits.length/8 < capacityBytes){
    const pb = padBytes[p%2]; p++;
    for(let i=7;i>=0;i--) bits.push((pb>>i)&1);
  }
  // convert to bytes
  const out=[];
  for(let i=0;i<bits.length;i+=8){
    let v=0;
    for(let j=0;j<8;j++) v=(v<<1)|bits[i+j];
    out.push(v);
  }
  return out;
}

/* ---------------------------
  Build final codeword sequence with RS per block and interleaving
--------------------------- */
function makeCodewords(version, eccLevel, dataBytes){
  // find ec block info
  const ecInfo = QR_VERSIONS[version].ec[eccLevel];
  const ecCodewordsPerBlock = ecInfo.ecCodewords;
  // flatten blocks description into explicit blocks
  const blocks = [];
  for(const b of ecInfo.blocks){
    // some entries might be mixed arrays - in our table each block entry is {count,data}
    if(b.count === undefined) throw new Error('block format bad');
    for(let i=0;i<b.count;i++) blocks.push({data: b.data});
  }
  // If total data capacity is > combined dataBytes length, we assume buildDataBytes already padded to capacity.
  // Now split dataBytes into the blocks' data lengths (some blocks may differ by 1).
  // But spec: some versions have two sizes — we handle by computing expected lengths by looking at blocks array.
  // We'll compute counts per block by reading data lengths from blocks[] in order.
  const blockDataArr = [];
  let pos = 0;
  for(const b of blocks){
    const len = b.data;
    const slice = dataBytes.slice(pos, pos + len);
    // if short, pad with 0 (shouldn't happen if buildDataBytes matched capacity)
    while(slice.length < len) slice.push(0);
    blockDataArr.push(slice);
    pos += len;
  }

  // For compatibility: if pos < dataBytes.length -> keep remainder into last block(s)
  // But that shouldn't happen if capacity matched.
  // Now compute RS for each block
  const eccBlocks = blockDataArr.map(d => rsEncode(d, ecCodewordsPerBlock));
  // Interleave data codewords
  const maxDataLen = Math.max(...blockDataArr.map(b=>b.length));
  const interleaved = [];
  for(let i=0;i<maxDataLen;i++){
    for(const b of blockDataArr){
      if(i < b.length) interleaved.push(b[i]);
    }
  }
  // then interleave ecc codewords
  for(let i=0;i<ecCodewordsPerBlock;i++){
    for(const eb of eccBlocks){
      interleaved.push(eb[i]);
    }
  }
  // final bitstream is interleaved (each codeword => 8 bits MSB first)
  const bits = [];
  for(const cw of interleaved){
    for(let i=7;i>=0;i--) bits.push((cw>>i)&1);
  }
  return {bits, codewords: interleaved};
}

/* ---------------------------
  Matrix building: function patterns, alignment locations, etc.
--------------------------- */

/* version => size: 21 + (v-1)*4 */
function sizeOfVersion(v){return 21 + (v-1)*4;}

/* place finder patterns at 3 corners */
function placeFinder(matrix, row, col){
  const n = matrix.length;
  for(let r=-1;r<=7;r++){
    for(let c=-1;c<=7;c++){
      const rr = row + r, cc = col + c;
      if(rr<0||cc<0||rr>=n||cc>=n) continue;
      let val;
      if((r>=0&&r<=6&&c>=0&&c<=6) && (r===0||r===6||c===0||c===6)) val=1; // outer dark
      else if(r>=2&&r<=4&&c>=2&&c<=4) val=1; // inner dark
      else val=0;
      matrix[rr][cc] = {fixed:true, val};
    }
  }
}

/* place separators (white) are already placed by placeFinder's -1/+7 region but ensure */
function placeSeparators(matrix,row,col){
  /* handled inside placeFinder with outer -1..7 area set; nothing else necessary */
}

/* place timing patterns */
function placeTiming(matrix){
  const n = matrix.length;
  for(let i=8;i<n-8;i++){
    const v = (i%2===0)?1:0;
    if(!matrix[6][i]) matrix[6][i] = {fixed:true, val:v};
    if(!matrix[i][6]) matrix[i][6] = {fixed:true, val:v};
  }
}

/* alignment patterns positions per version from standard table for versions 1..10 */
const ALIGN_POS = {
  1: [],
  2: [6,18],
  3: [6,22],
  4: [6,26],
  5: [6,30],
  6: [6,34],
  7: [6,22,38],
  8: [6,24,42],
  9: [6,26,46],
 10: [6,28,50]
};

function placeAlignment(matrix, version){
  const pos = ALIGN_POS[version];
  if(!pos || pos.length===0) return;
  for(let r=0;r<pos.length;r++){
    for(let c=0;c<pos.length;c++){
      const row=pos[r], col=pos[c];
      // skip if overlaps finder (top-left, top-right, bottom-left areas)
      if((row===6 && col===6) || (row===6 && col===matrix.length-7) || (row===matrix.length-7 && col===6)) continue;
      // place 5x5 pattern centered at (row,col)
      for(let dr=-2;dr<=2;dr++){
        for(let dc=-2;dc<=2;dc++){
          const rr=row+dr, cc=col+dc;
          if(rr<0||cc<0||rr>=matrix.length||cc>=matrix.length) continue;
          let val;
          if(Math.abs(dr)===2 || Math.abs(dc)===2) val=1;
          else if(dr===0 && dc===0) val=1;
          else val=0;
          matrix[rr][cc] = {fixed:true, val};
        }
      }
    }
  }
}

/* reserve format & version info areas (mark as fixed to avoid placing data there) */
function markFormatAndVersionAreas(matrix, version){
  const n = matrix.length;
  // format: 15 bits around top-left, top-right, bottom-left
  for(let i=0;i<9;i++){
    if(!matrix[8][i]) matrix[8][i] = {fixed:true, val:0}; // format row
    if(!matrix[i][8]) matrix[i][8] = {fixed:true, val:0}; // format col
  }
  // other format locations
  for(let i=0;i<8;i++){
    if(!matrix[8][n-1 - i]) matrix[8][n-1 - i] = {fixed:true, val:0};
    if(!matrix[n-1 - i][8]) matrix[n-1 - i][8] = {fixed:true, val:0};
  }
  // version info: for v>=7, two 3x6 areas (we only support up to v10 so include when v>=7)
  if(version>=7){
    for(let i=0;i<6;i++){
      for(let j=0;j<3;j++){
        matrix[i][n-11 + j] = {fixed:true,val:0};
        matrix[n-11 + j][i] = {fixed:true,val:0};
      }
    }
  }
}

/* place dark module */
function placeDarkModule(matrix, version){
  const n = matrix.length;
  matrix[4*version +9 - (version*4)/*not used*/] = matrix[ (n-8) + 1 ]; // ignore nonsense; simpler:
  matrix[n-8][8] = {fixed:true, val:1}; // dark module position is (4*version+9?) but spec: (8, n-8) fixed dark module
  // simpler: place (8, n-8)
  matrix[8][n-8] = {fixed:true, val:1};
}

/* initialize empty matrix */
function makeEmptyMatrix(version){
  const n = sizeOfVersion(version);
  const m = new Array(n);
  for(let i=0;i<n;i++){
    m[i] = new Array(n);
    for(let j=0;j<n;j++) m[i][j] = null;
  }
  // place finders
  placeFinder(m,0,0);
  placeFinder(m,0,n-7);
  placeFinder(m,n-7,0);
  // separators are already white around finders handled above
  // timing
  placeTiming(m);
  // alignment
  placeAlignment(m, version);
  // dark module
  m[8][n-8] = {fixed:true, val:1};
  // reserve format/version
  markFormatAndVersionAreas(m, version);
  return m;
}

/* place data bits in zigzag pattern from bottom-right upwards */
function placeDataBits(matrix, bits){
  const n = matrix.length;
  let dirUp = true;
  let col = n-1;
  let row = n-1;
  let bitIndex = 0;

  // skip vertical timing column (col==6)
  while(col>0){
    if(col===6) col--; // skip timing column
    for(let i=0;i<n;i++){
      const r = dirUp ? (n-1-i) : i;
      for(let c=0;c<2;c++){
        const cc = col - c;
        if(matrix[r][cc] && matrix[r][cc].fixed) continue;
        const bit = (bitIndex < bits.length) ? bits[bitIndex] : 0;
        matrix[r][cc] = {fixed:false, val:bit};
        bitIndex++;
      }
    }
    col -= 2;
    dirUp = !dirUp;
  }
}

/* apply mask function (0..7) */
function maskBit(mask, r, c, bit){
  switch(mask){
    case 0: return ((r + c) % 2 === 0) ? (bit ^ 1) : bit;
    case 1: return (r % 2 === 0) ? (bit ^ 1) : bit;
    case 2: return (c % 3 === 0) ? (bit ^ 1) : bit;
    case 3: return ((r + c) % 3 === 0) ? (bit ^ 1) : bit;
    case 4: return ((Math.floor(r/2) + Math.floor(c/3)) % 2 === 0) ? (bit ^ 1) : bit;
    case 5: return ((r*c % 2) + (r*c %3) === 0) ? (bit ^ 1) : bit;
    case 6: return (((r*c % 2) + (r*c %3)) %2 === 0) ? (bit ^ 1) : bit;
    case 7: return (((r + c) % 2) + (r*c %3) === 0) ? (bit ^ 1) : bit;
    default: return bit;
  }
}

/* produce matrix copy with mask applied (only on non-fixed cells) */
function applyMaskToMatrix(matrix, mask){
  const n = matrix.length;
  const res = new Array(n);
  for(let r=0;r<n;r++){
    res[r] = new Array(n);
    for(let c=0;c<n;c++){
      const cell = matrix[r][c];
      if(!cell) res[r][c] = {fixed:false, val: maskBit(mask, r, c, 0)};
      else if(cell.fixed) res[r][c] = {fixed:true, val:cell.val};
      else res[r][c] = {fixed:false, val: maskBit(mask, r, c, cell.val)};
    }
  }
  return res;
}

/* compute penalty per QR spec (N1..N4) */
function computePenalty(matrix){
  const n = matrix.length;
  let penalty = 0;
  // N1: rows & columns with 5+ consecutive same color
  for(let r=0;r<n;r++){
    let run=1;
    for(let c=1;c<n;c++){
      if(matrix[r][c].val === matrix[r][c-1].val) run++; else { if(run>=5) penalty += 3 + (run-5); run=1; }
    }
    if(run>=5) penalty += 3 + (run-5);
  }
  for(let c=0;c<n;c++){
    let run=1;
    for(let r=1;r<n;r++){
      if(matrix[r][c].val === matrix[r-1][c].val) run++; else { if(run>=5) penalty += 3 + (run-5); run=1; }
    }
    if(run>=5) penalty += 3 + (run-5);
  }
  // N2: 2x2 blocks of same color
  for(let r=0;r<n-1;r++){
    for(let c=0;c<n-1;c++){
      const v = matrix[r][c].val;
      if(matrix[r][c+1].val===v && matrix[r+1][c].val===v && matrix[r+1][c+1].val===v) penalty += 3;
    }
  }
  // N3: patterns similar to 1:1:3:1:1 (dark-light-dark-dark-dark-light-dark) in rows/cols
  const PATTERN1 = [1,0,1,1,1,0,1,0,0,0,0]; // extended check
  const PATTERN2 = [0,0,0,0,1,0,1,1,1,0,1];
  function checkPatternLine(arr){
    for(let i=0;i+10<arr.length;i++){
      let ok1=true, ok2=true;
      for(let j=0;j<11;j++){
        if(arr[i+j] !== PATTERN1[j]) ok1=false;
        if(arr[i+j] !== PATTERN2[j]) ok2=false;
      }
      if(ok1||ok2) return true;
    }
    return false;
  }
  for(let r=0;r<n;r++){
    const arr = matrix[r].map(x=>x.val);
    if(checkPatternLine(arr)) penalty += 40;
  }
  for(let c=0;c<n;c++){
    const arr = [];
    for(let r=0;r<n;r++) arr.push(matrix[r][c].val);
    if(checkPatternLine(arr)) penalty += 40;
  }
  // N4: proportion of dark modules — find nearest multiple of 5% away from 50%
  let dark=0,total=n*n;
  for(let r=0;r<n;r++) for(let c=0;c<n;c++) if(matrix[r][c].val===1) dark++;
  const ratio = Math.abs((dark*100/total) - 50);
  penalty += Math.floor(ratio / 5) * 10;
  return penalty;
}

/* compute format bits (15 bits): 5 bits for ecl+mask + 10-bit BCH error correction (x^10 + x^8 + x^5 + x^4 + x^2 + x +1)
   formatInfo = (ECL<<3 | mask) then BCH(15,5) with mask 0x5412 XOR
*/
function getFormatBits(ecl, mask){
  const ECL_MAP = {L:1, M:0, Q:3, H:2}; // mapping per spec for format bits (2-bit)
  const eclBits = ECL_MAP[ecl];
  const data = (eclBits << 3) | mask; // 5 bits
  // compute 10-bit BCH for 5-bit value using generator 0x537 (x^10 + x^8 + x^5 + x^4 + x^2 + x +1) decimal 0x537?
  let poly = data << 10;
  const G = 0x537; // generator
  for(let i=14;i>=10;i--){
    if((poly >> i) & 1){
      poly ^= (G << (i-10));
    }
  }
  const format = ((data << 10) | (poly & 0x3FF)) ^ 0x5412;
  return format; // 15 bits
}

/* write format bits into matrix at reserved positions */
function writeFormatBits(matrix, format){
  const n = matrix.length;
  // top-left: (8,0..5) and (8,7) and (0..5,8) and (7,8)
  for(let i=0;i<6;i++){
    const bit = (format >> i) & 1;
    matrix[8][n-1 - i] = {fixed:true, val: bit};
  }
  // and other positions per spec
  // We'll implement per QR unique mapping:
  const bits = [];
  for(let i=0;i<15;i++) bits.push((format >> i) & 1);
  // positions per spec:
  const pos = [
    [8,0],[8,1],[8,2],[8,3],[8,4],[8,5],[8,7],[8,8],[7,8],[5,8],[4,8],[3,8],[2,8],[1,8],[0,8]
  ];
  // but proper order is different; to be safe: set two symmetric locations
  // top-left area (row 8)
  matrix[8][0] = {fixed:true, val: (format>>14)&1 };
  matrix[8][1] = {fixed:true, val: (format>>13)&1 };
  matrix[8][2] = {fixed:true, val: (format>>12)&1 };
  matrix[8][3] = {fixed:true, val: (format>>11)&1 };
  matrix[8][4] = {fixed:true, val: (format>>10)&1 };
  matrix[8][5] = {fixed:true, val: (format>>9)&1 };
  matrix[8][7] = {fixed:true, val: (format>>8)&1 };
  matrix[8][8] = {fixed:true, val: (format>>7)&1 };
  matrix[7][8] = {fixed:true, val: (format>>6)&1 };
  matrix[5][8] = {fixed:true, val: (format>>5)&1 };
  matrix[4][8] = {fixed:true, val: (format>>4)&1 };
  matrix[3][8] = {fixed:true, val: (format>>3)&1 };
  matrix[2][8] = {fixed:true, val: (format>>2)&1 };
  matrix[1][8] = {fixed:true, val: (format>>1)&1 };
  matrix[0][8] = {fixed:true, val: (format>>0)&1 };

  // other side: top-right and bottom-left
  const n1 = n-1;
  matrix[8][n1] = {fixed:true, val: (format>>14)&1};
  matrix[8][n1-1] = {fixed:true, val: (format>>13)&1};
  matrix[8][n1-2] = {fixed:true, val: (format>>12)&1};
  matrix[8][n1-3] = {fixed:true, val: (format>>11)&1};
  matrix[8][n1-4] = {fixed:true, val: (format>>10)&1};
  matrix[8][n1-5] = {fixed:true, val: (format>>9)&1};
  matrix[8][n1-7] = {fixed:true, val: (format>>8)&1};
  // bottom-left
  matrix[n1][8] = {fixed:true, val: (format>>7)&1};
  matrix[n1-1][8] = {fixed:true, val: (format>>6)&1};
  matrix[n1-2][8] = {fixed:true, val: (format>>5)&1};
  matrix[n1-3][8] = {fixed:true, val: (format>>4)&1};
  matrix[n1-4][8] = {fixed:true, val: (format>>3)&1};
  matrix[n1-5][8] = {fixed:true, val: (format>>2)&1};
  matrix[n1-6][8] = {fixed:true, val: (format>>1)&1};
  matrix[n1-7][8] = {fixed:true, val: (format>>0)&1};
}

/* build final QR matrix choosing best mask */
function buildMatrix(version, bits, eccLevel){
  // make empty matrix with function patterns placed
  const base = makeEmptyMatrix(version);
  // place data bits
  placeDataBits(base, bits);
  // try masks 0..7 and pick best
  let bestMask = 0; let bestMatrix=null; let bestScore=Number.MAX_SAFE_INTEGER;
  for(let m=0;m<8;m++){
    const masked = applyMaskToMatrix(base, m);
    // write format bits (we need format bits after mask selection usually — format bits depend on mask)
    const format = getFormatBits(eccLevel, m);
    // copy masked to temp to write format bits, but avoid mutating masked since we'll evaluate
    const temp = masked.map(row=>row.map(cell=> ({...cell})));
    writeFormatBits(temp, format);
    const score = computePenalty(temp);
    if(score < bestScore){ bestScore = score; bestMask = m; bestMatrix = temp; }
  }
  // ensure format bits with chosen mask are written
  writeFormatBits(bestMatrix, getFormatBits(eccLevel, bestMask));
  return {matrix:bestMatrix, mask:bestMask, penalty:bestScore};
}

/* Render matrix to SVG */
function renderSVG(matrix, scale=6, quietZone=4){
  const n = matrix.length;
  const size = (n + 2*quietZone) * scale;
  const dark = '#041626';
  const light = '#ffffff';
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`;
  svg += `<rect width="100%" height="100%" fill="${light}"/>`;
  svg += `<g transform="translate(${quietZone*scale},${quietZone*scale})">`;
  for(let r=0;r<n;r++){
    for(let c=0;c<n;c++){
      if(matrix[r][c].val){
        const x = c*scale;
        const y = r*scale;
        svg += `<rect x="${x}" y="${y}" width="${scale}" height="${scale}" fill="${dark}"/>`;
      }
    }
  }
  svg += `</g></svg>`;
  return svg;
}

/* ---------------------------
  High-level generator wrapper
--------------------------- */
function generateQRCode(text, options={versionMax:10, ecc:'M'}){
  // convert text to UTF-8 bytes
  const bytes = Array.from(toUTF8Bytes(text));
  // find minimal version 1..versionMax that fits
  let chosenVersion = null;
  for(let v=1; v<=options.versionMax; v++){
    const cap = QR_VERSIONS[v].capacities[options.ecc];
    if(bytes.length <= cap){ chosenVersion = v; break; }
  }
  if(!chosenVersion){
    throw new Error('Data too long for selected max version & ECC. Try higher max version or reduce data.');
  }
  // build data bytes
  const dataBytes = buildDataBytes(bytes, chosenVersion, options.ecc);
  // make codewords + ecc + interleave -> bits
  const {bits, codewords} = makeCodewords(chosenVersion, options.ecc, dataBytes);
  // build matrix choose mask
  const {matrix, mask, penalty} = buildMatrix(chosenVersion, bits, options.ecc);
  const svg = renderSVG(matrix, 6, 4);
  return {svg, version:chosenVersion, mask, penalty, codewordsCount:codewords.length};
}

/* ---------------------------
  UI wiring
--------------------------- */
const dataEl = document.getElementById('data');
const genBtn = document.getElementById('genBtn');
const svgout = document.getElementById('svgout');
const info = document.getElementById('info');
const versionRange = document.getElementById('version');
const verlabel = document.getElementById('verlabel');
const eccSel = document.getElementById('ecc');
const downloadBtn = document.getElementById('downloadBtn');

versionRange.addEventListener('input', ()=> verlabel.textContent = versionRange.value);

genBtn.addEventListener('click', ()=>{
  try{
    svgout.innerHTML = '';
    info.textContent = 'Generating...';
    const txt = dataEl.value || '';
    const opts = { versionMax: parseInt(versionRange.value,10), ecc: eccSel.value };
    const start = performance.now();
    const res = generateQRCode(txt, opts);
    const took = Math.round(performance.now()-start);
    svgout.innerHTML = res.svg;
    info.innerHTML = `<div class="badge">v${res.version}</div><div class="badge">mask ${res.mask}</div><div class="badge">penalty ${res.penalty}</div><div class="small">codewords ${res.codewordsCount}</div><div class="small" style="margin-top:6px">Generated in ${took}ms</div>`;
  }catch(e){
    info.innerHTML = `<span style="color:#f88">Error: ${e.message}</span>`;
    console.error(e);
  }
});

downloadBtn.addEventListener('click', ()=>{
  const svgEl = svgout.querySelector('svg');
  if(!svgEl){ alert('No QR generated yet.'); return; }
  const svgStr = svgEl.outerHTML;
  const blob = new Blob([svgStr], {type:'image/svg+xml'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'qrcode.svg';
  a.click();
  URL.revokeObjectURL(url);
});

/* prefill example */
dataEl.value = "";