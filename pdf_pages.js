// 계약서 양식 (092): PDF 를 페이지 그림(PNG)으로 바꾸고 SHA-256 을 구한다
//   관리자가 양식을 올릴 때만 쓴다. pdf.js 는 그때 한 번 받아 온다 (받는 사람 화면은 그림만 본다)
//   pdf.js 4.10.38 은 web/pdfjs/ 에 같이 둔다 (외부 CDN 을 쓰지 않음, LICENSE = Apache-2.0)
//   window.__eumPdfPages(Uint8Array) → {sha256, pages: [{w, h, png: Uint8Array}]}
//     w · h 는 PDF 단위(pt). 그림은 2배 크기 (긴 쪽 최대 2400px)
(function () {
  // <base href> 기준 (ys-eng.kr = /, GitHub Pages = /siteline-web/)
  var PDFJS = new URL('pdfjs/', document.baseURI).href;
  var lib = null;

  function load() {
    if (!lib) {
      lib = import(PDFJS + 'pdf.min.mjs').then(function (m) {
        m.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.mjs';
        return m;
      });
    }
    return lib;
  }

  function hex(buf) {
    return Array.prototype.map
      .call(new Uint8Array(buf), function (b) {
        return ('0' + b.toString(16)).slice(-2);
      })
      .join('');
  }

  window.__eumPdfPages = async function (bytes) {
    var sha = hex(await crypto.subtle.digest('SHA-256', bytes));
    var pdfjs = await load();
    // pdf.js 가 버퍼를 넘겨받아 비우므로 복사본을 준다
    var doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
    var pages = [];
    for (var i = 1; i <= doc.numPages; i++) {
      var page = await doc.getPage(i);
      var base = page.getViewport({ scale: 1 });
      var scale = Math.min(2, 2400 / Math.max(base.width, base.height));
      var vp = page.getViewport({ scale: scale });
      var canvas = document.createElement('canvas');
      canvas.width = Math.round(vp.width);
      canvas.height = Math.round(vp.height);
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      var blob = await new Promise(function (r) {
        canvas.toBlob(r, 'image/png');
      });
      pages.push({
        w: base.width,
        h: base.height,
        png: new Uint8Array(await blob.arrayBuffer()),
      });
      page.cleanup();
    }
    await doc.destroy();
    return { sha256: sha, pages: pages };
  };
})();
