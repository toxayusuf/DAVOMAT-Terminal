(() => {
  'use strict';
  let armed = true;
  let wasVisible = false;
  function visible(el){ return !!el && !el.classList.contains('hidden') && el.offsetParent !== null; }
  function tick(){
    const banner = document.getElementById('enrollBanner');
    const btn = document.getElementById('startEnrollBtn');
    const nowVisible = visible(banner);
    if (!nowVisible) {
      if (wasVisible) armed = true;
      wasVisible = false;
      return;
    }
    if (!wasVisible && armed && btn) {
      armed = false;
      setTimeout(() => {
        if (visible(banner) && !document.getElementById('cameraView')?.classList.contains('hidden')) return;
        if (visible(banner)) btn.click();
      }, 550);
    }
    wasVisible = true;
  }
  new MutationObserver(tick).observe(document.documentElement,{subtree:true,attributes:true,attributeFilter:['class'],childList:true});
  setInterval(tick,700);
  window.addEventListener('load',tick);
})();
