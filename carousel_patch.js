
document.addEventListener('DOMContentLoaded', function () {
  const track = document.querySelector('#homeTrack');
  const prevButton = document.querySelector('.carousel .arrow.prev');
  const nextButton = document.querySelector('.carousel .arrow.next');
  const cards = track ? Array.from(track.children) : [];
  const cardWidth = track ? track.clientWidth / 5 : 0; // 5 items max

  let index = 0;

  function updateCarousel() {
    track.style.transform = `translateX(-${index * cardWidth}px)`;
  }

  if (prevButton) {
    prevButton.addEventListener('click', () => {
      index = Math.max(index - 1, 0);
      updateCarousel();
    });
  }

  if (nextButton) {
    nextButton.addEventListener('click', () => {
      index = Math.min(index + 1, cards.length - 5);
      updateCarousel();
    });
  }

  window.addEventListener('resize', () => {
    updateCarousel();
  });
});
