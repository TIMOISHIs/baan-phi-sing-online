/* Presentation only: preserve live nodes, IDs and their existing handlers. */
(()=>{
 const q=s=>document.querySelector(s);
 const spirit=q('.bps-spirit'),rail=q('.bps-action-rail');
 spirit.before(rail);
 const track=q('.bps-ritual'),curse=q('#curse').closest('.hud-stat');
 curse.classList.add('bps-ghost-curse');
 q('.ghost-head').append(curse);
 q('#ghostFear').hidden=true;
 q('#ghostHealth').after(track);
 q('.bps-brand small').textContent='v1.15.3';
})();
