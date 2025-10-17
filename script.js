
// Small interactions: contact form sends mailto (no backend)

// small fade-in on scroll
document.addEventListener('scroll', function(){
  document.querySelectorAll('section').forEach(sec=>{
    const top = sec.getBoundingClientRect().top;
    if(top < window.innerHeight - 80){
      sec.style.opacity = 1;
      sec.style.transform = 'translateY(0)';
    }
  });
});
document.querySelectorAll('section').forEach(sec=>{
  sec.style.opacity = 0;
  sec.style.transform = 'translateY(12px)';
  sec.style.transition = 'all 500ms ease';
});
