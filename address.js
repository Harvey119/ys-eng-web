// 주소 찾기 (2026-11-10): 카카오 우편번호 서비스 (키 없음 · 무료, 자료는 행정안전부 도로명주소)
//   window.__eumAddress() → Promise<{zonecode, road, jibun, full} | null>
//     full = 도로명주소 + (법정동, 건물명) — 엑셀 · 연명부에 쓰는 한 줄 주소
//   앱 화면(캔버스) 위에 덮개를 띄우고 그 안에 검색 창을 넣는다 (팝업 창은 막히기 쉬워 쓰지 않음)
(function () {
  var SRC = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
  var loading = null;

  function load() {
    if (window.daum && window.daum.Postcode) return Promise.resolve();
    if (!loading) {
      loading = new Promise(function (ok, fail) {
        var s = document.createElement('script');
        s.src = SRC;
        s.onload = function () { ok(); };
        s.onerror = function () { loading = null; fail(new Error('주소 찾기를 불러오지 못했습니다.')); };
        document.head.appendChild(s);
      });
    }
    return loading;
  }

  window.__eumAddress = function () {
    return load().then(function () {
      return new Promise(function (resolve) {
        var back = document.createElement('div');
        back.style.cssText =
          'position:fixed;inset:0;z-index:2147483000;background:rgba(15,23,42,.45);' +
          'display:flex;align-items:center;justify-content:center;';
        var box = document.createElement('div');
        box.style.cssText =
          'width:min(520px,96vw);height:min(600px,90vh);background:#fff;border-radius:10px;' +
          'overflow:hidden;display:flex;flex-direction:column;box-shadow:0 10px 30px rgba(0,0,0,.3);';
        var head = document.createElement('div');
        head.style.cssText =
          'display:flex;align-items:center;justify-content:space-between;padding:10px 14px;' +
          'border-bottom:1px solid #e2e8f0;font:600 15px sans-serif;color:#0f172a;';
        head.textContent = '주소 찾기';
        var close = document.createElement('button');
        close.textContent = '닫기';
        close.style.cssText =
          'border:0;background:#4b5563;color:#fff;border-radius:6px;padding:6px 12px;cursor:pointer;font:13px sans-serif;';
        head.appendChild(close);
        var area = document.createElement('div');
        area.style.cssText = 'flex:1;min-height:0;';
        box.appendChild(head);
        box.appendChild(area);
        back.appendChild(box);
        document.body.appendChild(back);

        var done = false;
        function finish(v) {
          if (done) return;
          done = true;
          back.remove();
          resolve(v);
        }
        close.onclick = function () { finish(null); };
        back.onclick = function (e) { if (e.target === back) finish(null); };

        new window.daum.Postcode({
          width: '100%',
          height: '100%',
          oncomplete: function (d) {
            var road = d.roadAddress || d.autoRoadAddress || '';
            var extra = [];
            if (d.bname && /[동로가]$/.test(d.bname)) extra.push(d.bname);
            if (d.buildingName && d.apartment === 'Y') extra.push(d.buildingName);
            var full = road ? road + (extra.length ? ' (' + extra.join(', ') + ')' : '') : (d.jibunAddress || d.address);
            finish({
              zonecode: d.zonecode || '',
              road: road,
              jibun: d.jibunAddress || d.autoJibunAddress || '',
              full: full,
            });
          },
        }).embed(area);
      });
    });
  };
})();
