// function initLoader() {

//   const loader = document.querySelector('.loader');
//   const logoWrap = document.querySelector('.logoWrap');
//   const text = document.querySelector('.text');

//   const particles = document.querySelector('.particles');
//   if (particles) particles.remove();

//   const progressWrap = document.querySelector('.progressWrap');
//   const progressFill = document.querySelector('.progressFill');
//   const progressText = document.querySelector('.progressText');

//   if (!loader || !progressFill || !progressText) {
//     console.error('[Loader] Missing required elements');
//     return false;
//   }

  
//   const MIN_LOADER_TIME = 6000;
//   const loaderStartTime = Date.now();

//   let progress = 0;
//   let fakeProgress = 0;
//   let pageLoaded = false;

  
//   const progressInterval = setInterval(() => {

//     if (fakeProgress < 92) {

//       fakeProgress += Math.random() * 8;
//       progress = Math.min(fakeProgress, 92);

//       progressFill.style.width = progress + '%';
//       progressText.textContent = Math.floor(progress) + '%';
//     }

//   }, 180);

  
//   window.addEventListener('load', () => {

//     pageLoaded = true;

//     const elapsed = Date.now() - loaderStartTime;
//     const remaining = Math.max(MIN_LOADER_TIME - elapsed, 0);

//     setTimeout(() => {

//       clearInterval(progressInterval);

      
//       const finish = setInterval(() => {

//         progress += 3;

//         if (progress >= 100) {

//           progress = 100;

//           progressFill.style.width = '100%';
//           progressText.textContent = '100%';

//           clearInterval(finish);

          
//           setTimeout(() => {

//             loader.style.transition =
//               'opacity 0.9s ease, visibility 0.9s ease';

//             loader.style.opacity = '0';
//             loader.style.visibility = 'hidden';

//             setTimeout(() => {
//               loader.remove();
//             }, 900);

//           }, 500);

//         } else {

//           progressFill.style.width = progress + '%';
//           progressText.textContent = Math.floor(progress) + '%';
//         }

//       }, 25);

//     }, remaining);

//   });

//   return true;
// }


// function waitForLoader(retries = 50) {

//   if (initLoader()) return;

//   if (retries <= 0) {
//     console.error('[Loader] Loader not found');
//     return;
//   }

//   setTimeout(() => waitForLoader(retries - 1), 100);
// }

// if (document.readyState === 'loading') {
//   document.addEventListener('DOMContentLoaded', () => waitForLoader());
// } else {
//   waitForLoader();
// }