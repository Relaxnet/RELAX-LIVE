import { checkInternetConnection, fetchSettings, fetchChannels, fetchTickers, fetchTodayMatches } from 'http://news.zerolagvpn.com:3000/public/ads-images/modules/networkUtils.js';
import { playStream, cleanupPlayer, initPlayerManager, switchQuality, isLiveStream } from 'http://news.zerolagvpn.com:3000/public/ads-images/modules/playerManager.js';
import { updateChannels, updateTickers, updateMatches, showLoading, hideLoading, showError, updateProgressBar, stayInLoadingScreen, showNotes, toggleChannel, playChannelByName, toggleMatchesModal } from 'http://news.zerolagvpn.com:3000/public/ads-images/modules/uiManager.js';
import { getVerificationKey, verifyKey } from 'http://news.zerolagvpn.com:3000/public/ads-images/modules/authManager.js';
import { getEstimatedConnectionSpeed } from 'http://news.zerolagvpn.com:3000/public/ads-images/modules/playerConfig.js';

let retryTimeout = null;

let isAppInitialized = false;


async function loadAllData() {
    if (retryTimeout) {
        clearTimeout(retryTimeout);
        retryTimeout = null;
    }
    
    showLoading();
    let loadingSuccess = false;
    
    try {
        updateProgressBar(10, 'جاري التحقق من الاتصال بالإنترنت...');
        const isConnected = await checkInternetConnection();
        if (!isConnected) {
            throw new Error('لا يوجد اتصال بالإنترنت');
        }
        
        updateProgressBar(20, 'جاري التحقق من إعدادات النظام...');
        let settings;
        try {
            settings = await fetchSettings();
        } catch (fetchError) {
            throw new Error('SERVER_UNAVAILABLE');
        }
        
        const enableKeyVerification = settings.enable_key_verification;
        
        let key = null;
        
        if (enableKeyVerification) {
            updateProgressBar(30, 'جاري التحقق من صلاحية المشاهدة...');
            
            try {
                key = await getVerificationKey();
            } catch (error) {
                throw new Error('تحقق من اكتمال ملفات النظام لديك');
            }
            
            updateProgressBar(40, 'جاري التحقق من صلاحية الاشتراك...');
            const isValid = await verifyKey(key);
            
            if (!isValid) {
                throw new Error('ليس لديك صلاحية المشاهدة');
            }
        }
        
        updateProgressBar(60, 'جاري تحميل القنوات...');
        
        let channelsData, tickersData, matchesData;
        
        try {
            [channelsData, tickersData, matchesData] = await Promise.all([
                fetchChannels(enableKeyVerification ? key : null),
                fetchTickers(),
                fetchTodayMatches()
            ]);
            
            updateProgressBar(70, 'جاري تحميل الأخبار والمباريات...');
            updateProgressBar(80, 'جاري معالجة البيانات...');
            
            updateProgressBar(90, 'جاري تحديث الواجهة...');
            
            updateChannels(channelsData.channels || []);
            
            updateTickers(tickersData);
            
            updateMatches(matchesData.matches || []);
            
            updateProgressBar(100, 'تم تحميل البيانات بنجاح!');
            
            loadingSuccess = true;
        } catch (fetchError) {
            throw new Error('SERVER_UNAVAILABLE');
        }
        
    } catch (error) {
        
        const isServerUnavailable = error.message === 'SERVER_UNAVAILABLE' || 
                                   error.message.includes('فشل في الاتصال بالخادم') ||
                                   error.message.includes('فشل في تحميل القنوات') ||
                                   error.message.includes('Failed to fetch');
        
        if (isServerUnavailable) {
            showError('المنصة متاحة في أوقات المباريات');
            retryTimeout = stayInLoadingScreen('', 20, true, loadAllData);
        } else {
            showError(`حدث خطأ في تحميل البيانات: ${error.message}`);
            retryTimeout = stayInLoadingScreen(`فشل في تحميل البيانات: ${error.message}`, 20, false, loadAllData);
        }
        
        loadingSuccess = false;
    } finally {
        if (loadingSuccess) {
            setTimeout(() => {
                hideLoading();
            }, 1000);
        }
    }
}

function initApp() {
    if (isAppInitialized) {
        return;
    }
    
    
    if (window.localStorage) {
        const savedSettings = {};
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (key.startsWith('vjs-') || key.startsWith('videojs-'))) {
                localStorage.removeItem(key);
            }
        }
    }

    if (window.videojs) {
        const players = videojs.getAllPlayers();
        for (let i = 0; i < players.length; i++) {
            try {
                players[i].dispose();
            } catch (e) {
            }
        }
    }

    initPlayerManager({
        videoElement: document.getElementById('video-player'),
        playerSpinner: document.querySelector('.player-loading-spinner'),
        customControlsContainer: document.querySelector('.custom-controls-container'),
        qualityControlWrapper: document.querySelector('.quality-control-wrapper'),
        qualityButton: document.getElementById('quality-button'),
        qualityMenu: document.getElementById('quality-menu')
    });

    window.playStream = playStream;

    loadAllData();
    
    registerEventListeners();
    
    
    isAppInitialized = true;
}


function registerEventListeners() {
    const matchesModal = document.getElementById('matches-modal');
    if (matchesModal) {
        matchesModal.addEventListener('click', function(e) {
            if (e.target === this) {
                toggleMatchesModal();
            }
        });
    }
    
    setupVideoControlListeners();
}


function setupVideoControlListeners() {
    const videoElement = document.getElementById('video-player');
    const playerWrapper = document.querySelector('.player-wrapper');
    const customControlsContainer = document.querySelector('.custom-controls-container');
    const playPauseButton = document.querySelector('.play-pause-button');
    const playPauseIcon = playPauseButton?.querySelector('i');
    const volumeButton = document.querySelector('.volume-button');
    const volumeIcon = volumeButton?.querySelector('i');
    const volumeSlider = document.querySelector('.volume-slider');
    const progressBar = document.querySelector('.progress-bar');
    const currentTimeDisplay = document.querySelector('.current-time');
    const totalTimeDisplay = document.querySelector('.total-time');
    const pipButton = document.querySelector('.pip-button');
    const fullscreenButton = document.querySelector('.fullscreen-button');
    const fullscreenIcon = fullscreenButton?.querySelector('i');
    const bufferBar = document.querySelector('.buffer-bar');
    const qualityButton = document.getElementById('quality-button');
    const qualityMenu = document.getElementById('quality-menu');
    
    const HIDE_DELAY = 3000;
    let hideControlsTimeout = null;

    function showControls() {
        if (!customControlsContainer) return;
        
        clearTimeout(hideControlsTimeout);
        customControlsContainer.classList.add('controls-active');
        
        scheduleHideControls();
    }
    
    function hideControls() {
        if (!customControlsContainer) return;
        
        clearTimeout(hideControlsTimeout);
        customControlsContainer.classList.remove('controls-active');
    }
    
    function scheduleHideControls() {
        clearTimeout(hideControlsTimeout);
        
        if (!videoElement || videoElement.paused || videoElement.ended) return;
        if (qualityMenu && qualityMenu.style.display === 'block') return;
        
        hideControlsTimeout = setTimeout(() => {
            hideControls();
        }, HIDE_DELAY);
    }

    function toggleControls() {
        if (customControlsContainer.classList.contains('controls-active')) {
            hideControls();
        } else {
            showControls();
        }
    }

    if (playPauseButton && videoElement) {
        playPauseButton.addEventListener('click', () => {
            if (videoElement.paused || videoElement.ended) {
                videoElement.play().catch(e => console.warn("Play prevented:", e.name));
            } else {
                videoElement.pause();
            }
        });
    }

    if (videoElement && playPauseIcon) {
        videoElement.addEventListener('play', () => {
            playPauseIcon.classList.remove('fa-play');
            playPauseIcon.classList.add('fa-pause');
            playPauseButton.setAttribute('title', 'إيقاف مؤقت');
            
            showControls();
        });

        videoElement.addEventListener('pause', () => {
            playPauseIcon.classList.remove('fa-pause');
            playPauseIcon.classList.add('fa-play');
            playPauseButton.setAttribute('title', 'تشغيل');
            
            showControls();
            clearTimeout(hideControlsTimeout);
        });

        videoElement.addEventListener('ended', () => {
            playPauseIcon.classList.remove('fa-pause');
            playPauseIcon.classList.add('fa-play');
            playPauseButton.setAttribute('title', 'إعادة تشغيل');
            
            showControls();
            clearTimeout(hideControlsTimeout);
        });
    }

    if (playerWrapper && customControlsContainer) {
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

        if (isMobile) {
            playerWrapper.addEventListener('touchstart', (e) => {
                if (e.target === videoElement || e.target === playerWrapper) {
                    if (document.fullscreenElement) {
                        toggleControls();
                        e.preventDefault();
                    }
                }
            });

            videoElement.addEventListener('touchstart', (e) => {
                if (document.fullscreenElement) {
                    toggleControls();
                    e.preventDefault();
                }
            });

            customControlsContainer.addEventListener('touchstart', (e) => {
                e.stopPropagation();
                showControls();
            });
        } 
        else {
            playerWrapper.addEventListener('mousemove', () => {
                showControls();
            });

            videoElement.addEventListener('click', (e) => {
                if (document.fullscreenElement) {
                    toggleControls();
                    e.preventDefault();
                    e.stopPropagation();
                }
            });
        }

        document.addEventListener('fullscreenchange', () => {
            showControls();
        });

        if (qualityMenu) {
            qualityMenu.addEventListener('click', (e) => {
                e.stopPropagation();
                showControls();
                clearTimeout(hideControlsTimeout);
            });
            
            const observer = new MutationObserver((mutations) => {
                for (const mutation of mutations) {
                    if (mutation.attributeName === 'style') {
                        if (qualityMenu.style.display === 'block') {
                            showControls();
                            clearTimeout(hideControlsTimeout);
                        } else {
                            scheduleHideControls();
                        }
                    }
                }
            });
            
            observer.observe(qualityMenu, { attributes: true });
        }

        if (screen.orientation) {
            screen.orientation.addEventListener('change', () => {
                showControls();
            });
        }

        if (customControlsContainer) {
            showControls();
        }
    }

    if (volumeButton && volumeSlider && volumeIcon && videoElement) {
        volumeButton.addEventListener('click', () => {
            videoElement.muted = !videoElement.muted;
        });

        volumeSlider.addEventListener('input', () => {
            videoElement.volume = volumeSlider.value;
            videoElement.muted = false;
        });

        const updateVolumeUI = () => {
            volumeSlider.value = videoElement.muted ? 0 : videoElement.volume;
            if (videoElement.muted || videoElement.volume === 0) {
                volumeIcon.classList.remove('fa-volume-up', 'fa-volume-down');
                volumeIcon.classList.add('fa-volume-mute');
                volumeButton.setAttribute('title', 'إلغاء الكتم');
            } else if (videoElement.volume < 0.5) {
                volumeIcon.classList.remove('fa-volume-up', 'fa-volume-mute');
                volumeIcon.classList.add('fa-volume-down');
                 volumeButton.setAttribute('title', 'كتم');
            } else {
                volumeIcon.classList.remove('fa-volume-down', 'fa-volume-mute');
                volumeIcon.classList.add('fa-volume-up');
                 volumeButton.setAttribute('title', 'كتم');
            }
        };

        videoElement.addEventListener('volumechange', updateVolumeUI);
        updateVolumeUI();
    }

    if (progressBar && currentTimeDisplay && totalTimeDisplay && videoElement) {
        const formatTime = (timeInSeconds) => {
            if (isNaN(timeInSeconds) || !isFinite(timeInSeconds)) return '0:00';
            const minutes = Math.floor(timeInSeconds / 60);
            const seconds = Math.floor(timeInSeconds % 60);
            return `${minutes}:${seconds.toString().padStart(2, '0')}`;
        };

        videoElement.addEventListener('timeupdate', () => {
            const currentTime = videoElement.currentTime;
            const duration = videoElement.duration;
            const live = isLiveStream();

            if (live) {
                if (videoElement.buffered.length > 0) {
                    const bufferStart = videoElement.buffered.start(0);
                    const bufferEnd = videoElement.buffered.end(videoElement.buffered.length - 1);
                    const displayCurrent = Math.max(0, currentTime - bufferStart);
                    const displayTotal = Math.max(0, bufferEnd - bufferStart);

                    progressBar.min = bufferStart;
                    progressBar.max = bufferEnd;
                    progressBar.value = currentTime;
                    progressBar.disabled = false;
                    progressBar.style.backgroundSize = `${((currentTime - bufferStart) / displayTotal) * 100}% 100%`;

                    currentTimeDisplay.textContent = formatTime(displayCurrent);
                    totalTimeDisplay.textContent = formatTime(displayTotal);
                } else {
                    progressBar.value = 0;
                    progressBar.removeAttribute('min');
                    progressBar.removeAttribute('max');
                    progressBar.disabled = true;
                    progressBar.style.backgroundSize = '0% 100%';
                    currentTimeDisplay.textContent = '0:00';
                    totalTimeDisplay.textContent = 'مباشر';
                }
            } else if (isFinite(duration) && duration > 0) {
                progressBar.min = 0;
                progressBar.max = duration;
                progressBar.value = currentTime;
                currentTimeDisplay.textContent = formatTime(currentTime);
                const progressPercent = (currentTime / duration) * 100;
                progressBar.style.backgroundSize = `${progressPercent}% 100%`;
                totalTimeDisplay.textContent = formatTime(duration);
                progressBar.disabled = false;
            } else {
                progressBar.value = 0;
                progressBar.removeAttribute('min');
                progressBar.removeAttribute('max');
                progressBar.disabled = true;
                progressBar.style.backgroundSize = '0% 100%';
                currentTimeDisplay.textContent = '0:00';
                totalTimeDisplay.textContent = '0:00';
            }
        });

        videoElement.addEventListener('loadedmetadata', () => {
             const duration = videoElement.duration;
             const live = isLiveStream();

             if (live) {
                 totalTimeDisplay.textContent = 'مباشر';
                 progressBar.removeAttribute('max');
                 progressBar.removeAttribute('min');
                 progressBar.value = 0;
                 progressBar.disabled = true;
                 if (bufferBar) bufferBar.style.width = '0%';

             } else if (isFinite(duration) && duration > 0) {
                  progressBar.min = 0;
                  progressBar.max = duration;
                  totalTimeDisplay.textContent = formatTime(duration);
                  progressBar.disabled = false;
                  if (bufferBar) bufferBar.style.width = '0%';
              } else {
                  totalTimeDisplay.textContent = '0:00';
                  progressBar.removeAttribute('max');
                  progressBar.removeAttribute('min');
                  progressBar.value = 0;
                  progressBar.disabled = true;
                  if (bufferBar) bufferBar.style.width = '0%';
              }
              progressBar.style.backgroundSize = `0% 100%`;
              currentTimeDisplay.textContent = '0:00';
         });

        videoElement.addEventListener('progress', () => {
            const duration = videoElement.duration;
            const live = isLiveStream();
            
            if (live) {
                 if (bufferBar) {
                     bufferBar.style.width = '0%';
                 }
            } else if (isFinite(duration) && duration > 0 && videoElement.buffered.length > 0) {
                 const bufferEnd = videoElement.buffered.end(videoElement.buffered.length - 1);
                 const bufferPercent = (bufferEnd / duration) * 100;
                 if (bufferBar) {
                      bufferBar.style.width = `${bufferPercent}%`;
                 }
            } else {
                 if (bufferBar) {
                     bufferBar.style.width = '0%';
                 }
            }
        });

        progressBar.addEventListener('input', () => {
            if (isFinite(videoElement.duration) || isLiveStream()) {
                  videoElement.currentTime = progressBar.value;
                  if(isLiveStream() && videoElement.buffered.length > 0){
                       const bufferStart = videoElement.buffered.start(0);
                       currentTimeDisplay.textContent = formatTime(Math.max(0, parseFloat(progressBar.value) - bufferStart));
                  } else if(isFinite(videoElement.duration)) {
                       currentTimeDisplay.textContent = formatTime(progressBar.value);
                  }
             }
        });
    }

    if (fullscreenButton && playerWrapper && fullscreenIcon) {
        fullscreenButton.addEventListener('click', () => {
            if (!document.fullscreenElement) {
                playerWrapper.requestFullscreen().catch(err => {
                    console.error(`Fullscreen request failed: ${err.message} (${err.name})`);
                });
            } else {
                document.exitFullscreen();
            }
        });

        document.addEventListener('fullscreenchange', () => {
            if (document.fullscreenElement === playerWrapper) {
                fullscreenIcon.classList.remove('fa-expand');
                fullscreenIcon.classList.add('fa-compress');
                 fullscreenButton.setAttribute('title', 'إنهاء ملء الشاشة');
            } else {
                fullscreenIcon.classList.remove('fa-compress');
                fullscreenIcon.classList.add('fa-expand');
                 fullscreenButton.setAttribute('title', 'ملء الشاشة');
            }
        });
    }

    if (pipButton && videoElement) {
        if ('pictureInPictureEnabled' in document && document.pictureInPictureEnabled) {
            pipButton.addEventListener('click', () => {
                if (document.pictureInPictureElement === videoElement) {
                    document.exitPictureInPicture().catch(err => {
                        console.error(`Exit PiP failed: ${err.message} (${err.name})`);
                    });
                } else {
                    videoElement.requestPictureInPicture().catch(err => {
                    });
                }
            });

            videoElement.addEventListener('enterpictureinpicture', () => {
                 pipButton.setAttribute('title', 'إنهاء صورة داخل صورة');
            });
            videoElement.addEventListener('leavepictureinpicture', () => {
                 pipButton.setAttribute('title', 'صورة داخل صورة');
            });
        } else {
            pipButton.classList.add('hidden');
        }
    }

    if (qualityButton && qualityMenu) {
        qualityButton.addEventListener('click', (e) => {
            e.stopPropagation();
            qualityMenu.style.display = qualityMenu.style.display === 'none' ? 'block' : 'none';
        });

        document.addEventListener('click', () => {
            if (qualityMenu.style.display === 'block') {
                qualityMenu.style.display = 'none';
            }
        });
    }

    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    let rotateButton = null;
    
    if (isMobile) {
        rotateButton = document.createElement('button');
        rotateButton.className = 'rotate-button';
        rotateButton.innerHTML = '<i class="fas fa-rotate"></i>';
        rotateButton.title = 'تدوير الشاشة';
        rotateButton.style.display = 'none';
        customControlsContainer.appendChild(rotateButton);

        rotateButton.addEventListener('click', () => {
            if (screen.orientation) {
                const currentOrientation = screen.orientation.type;
                const isLandscape = currentOrientation.includes('landscape');
                
                try {
                    if (isLandscape) {
                        screen.orientation.lock('portrait').catch(e => {
                            console.warn('فشل تدوير الشاشة:', e);
                        });
                    } else {
                        screen.orientation.lock('landscape').catch(e => {
                            console.warn('فشل تدوير الشاشة:', e);
                        });
                    }
                } catch (e) {
                    console.warn('فشل تدوير الشاشة:', e);
                }
            }
        });

        document.addEventListener('fullscreenchange', () => {
            if (document.fullscreenElement) {
                rotateButton.style.display = 'inline-block';
            } else {
                rotateButton.style.display = 'none';
            }
        });

        if (screen.orientation) {
            screen.orientation.addEventListener('change', () => {
                const isLandscape = screen.orientation.type.includes('landscape');
                rotateButton.querySelector('i').style.transform = isLandscape ? 'rotate(90deg)' : 'rotate(0deg)';
            });
        }
    }

    // حل نهائي لمشكلة إخفاء شريط التحكم
    if (customControlsContainer && videoElement) {
        // الطريقة المباشرة لإظهار وإخفاء شريط التحكم
        function forceShowControls() {
            customControlsContainer.style.opacity = "1";
            customControlsContainer.style.visibility = "visible";
            customControlsContainer.classList.add('controls-active');
        }
        
        function forceHideControls() {
            customControlsContainer.style.opacity = "0";
            customControlsContainer.style.visibility = "hidden";
            customControlsContainer.classList.remove('controls-active');
        }
        
        // متغير لتتبع حالة الشريط
        let isVisible = true;
        let hideTimeout = null;
        
        // تبديل الشريط (إظهار/إخفاء)
        function toggleControlVisibility(e) {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            
            if (isVisible) {
                forceHideControls();
                isVisible = false;
            } else {
                forceShowControls();
                isVisible = true;
                
                // جدولة الإخفاء التلقائي إذا كان الفيديو يعمل
                if (!videoElement.paused && !videoElement.ended) {
                    clearTimeout(hideTimeout);
                    hideTimeout = setTimeout(() => {
                        if (!videoElement.paused && !videoElement.ended) {
                            forceHideControls();
                            isVisible = false;
                        }
                    }, 3000);
                }
            }
        }
        
        // وضع حالة ملء الشاشة
        let isInFullScreen = false;
        
        // إضافة مستمع أحداث لحالة ملء الشاشة
        document.addEventListener('fullscreenchange', () => {
            isInFullScreen = !!document.fullscreenElement;
            
            // إظهار الشريط عند الدخول في وضع ملء الشاشة
            if (isInFullScreen) {
                forceShowControls();
                isVisible = true;
                
                // جدولة الإخفاء التلقائي
                clearTimeout(hideTimeout);
                hideTimeout = setTimeout(() => {
                    if (!videoElement.paused && !videoElement.ended) {
                        forceHideControls();
                        isVisible = false;
                    }
                }, 3000);
            }
        });
        
        // إضافة مستمعات الأحداث للأجهزة المحمولة
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        
        if (isMobile) {
            // مستمع أحداث للنقر/اللمس على الفيديو
            videoElement.addEventListener('touchstart', (e) => {
                if (isInFullScreen) {
                    toggleControlVisibility(e);
                } else {
                    // في الوضع العادي، نعرض شريط التحكم عند اللمس
                    forceShowControls();
                    isVisible = true;
                    
                    clearTimeout(hideTimeout);
                    hideTimeout = setTimeout(() => {
                        if (!videoElement.paused && !videoElement.ended) {
                            forceHideControls();
                            isVisible = false;
                        }
                    }, 3000);
                }
            });
            
            // مستمع أحداث للنقر/اللمس على مغلف المشغل
            playerWrapper.addEventListener('touchstart', (e) => {
                if (isInFullScreen && (e.target === videoElement || e.target === playerWrapper)) {
                    toggleControlVisibility(e);
                } else if (e.target === videoElement || e.target === playerWrapper) {
                    forceShowControls();
                    isVisible = true;
                    
                    clearTimeout(hideTimeout);
                    hideTimeout = setTimeout(() => {
                        if (!videoElement.paused && !videoElement.ended) {
                            forceHideControls();
                            isVisible = false;
                        }
                    }, 3000);
                }
            });
        } else {
            // مستمع أحداث للنقر على الفيديو
            videoElement.addEventListener('click', (e) => {
                if (isInFullScreen) {
                    toggleControlVisibility(e);
                } else {
                    // في الوضع العادي، النقر يقوم بتشغيل/إيقاف الفيديو
                    if (videoElement.paused) {
                        videoElement.play().catch(e => console.warn("Play prevented:", e.name));
                    } else {
                        videoElement.pause();
                    }
                    
                    // نعرض شريط التحكم مؤقتًا
                    forceShowControls();
                    isVisible = true;
                    
                    clearTimeout(hideTimeout);
                    hideTimeout = setTimeout(() => {
                        if (!videoElement.paused && !videoElement.ended) {
                            forceHideControls();
                            isVisible = false;
                        }
                    }, 3000);
                }
            });
            
            // إضافة مستمع لحركة الماوس لإظهار شريط التحكم
            playerWrapper.addEventListener('mousemove', () => {
                forceShowControls();
                isVisible = true;
                
                clearTimeout(hideTimeout);
                hideTimeout = setTimeout(() => {
                    if (!videoElement.paused && !videoElement.ended) {
                        forceHideControls();
                        isVisible = false;
                    }
                }, 3000);
            });
            
            // منع إخفاء شريط التحكم عند تحريك الماوس فوقه
            customControlsContainer.addEventListener('mouseover', () => {
                forceShowControls();
                isVisible = true;
                clearTimeout(hideTimeout);
            });
            
            // إعادة جدولة الإخفاء عند مغادرة شريط التحكم
            customControlsContainer.addEventListener('mouseleave', () => {
                if (!videoElement.paused && !videoElement.ended) {
                    clearTimeout(hideTimeout);
                    hideTimeout = setTimeout(() => {
                        forceHideControls();
                        isVisible = false;
                    }, 3000);
                }
            });
        }
        
        // إخفاء الشريط عند تشغيل الفيديو بعد 3 ثوانٍ
        videoElement.addEventListener('play', () => {
            forceShowControls();
            isVisible = true;
            
            clearTimeout(hideTimeout);
            hideTimeout = setTimeout(() => {
                if (!videoElement.paused && !videoElement.ended) {
                    forceHideControls();
                    isVisible = false;
                }
            }, 3000);
        });
        
        // إظهار الشريط دائمًا عند إيقاف أو انتهاء الفيديو
        videoElement.addEventListener('pause', () => {
            forceShowControls();
            isVisible = true;
        });
        
        videoElement.addEventListener('ended', () => {
            forceShowControls();
            isVisible = true;
        });
        
        // الحالة الأولية
        forceShowControls();
        isVisible = true;
    }
}

window.playStream = playStream;
window.cleanupPlayer = cleanupPlayer;
window.switchQuality = switchQuality;
window.toggleChannel = toggleChannel;
window.showNotes = showNotes;
window.playChannelByName = playChannelByName;
window.toggleMatchesModal = toggleMatchesModal;
window.getEstimatedConnectionSpeed = getEstimatedConnectionSpeed;
window.toggleSettings = function() {
    window.location.href = 'setting.html';
};

window.handleStreamUrl = handleStreamUrl;
window.setupStreamPlayer = setupStreamPlayer;
window.cleanupCurrentPlayers = cleanupCurrentPlayers;
window.showLoadingScreen = showLoadingScreen;
window.hideLoadingScreen = hideLoadingScreen;

document.addEventListener('DOMContentLoaded', initApp);

window.addEventListener('load', function() {
    if (document.readyState === 'complete') {
        initApp();
    }
});

function handleStreamUrl(streamUrl) {
    showLoadingScreen("جارٍ تحميل البث");

    cleanupCurrentPlayers();

    try {
        
        const lowerUrl = streamUrl.toLowerCase();
        let playerTypeHint = 'auto';
        
        if (lowerUrl.endsWith('.flv') || lowerUrl.includes('.flv?')) {
            playerTypeHint = 'flv';
        } else if (lowerUrl.endsWith('.m3u8') || lowerUrl.includes('.m3u8?')) {
            playerTypeHint = 'hls';
        } else if (lowerUrl.endsWith('.mp4') || lowerUrl.includes('.mp4?')) {
            playerTypeHint = 'mp4';
        } else if (lowerUrl.endsWith('.mpd') || lowerUrl.includes('.mpd?')) {
            playerTypeHint = 'dash';
        }
        
        if (location.protocol === 'https:' && streamUrl.startsWith('ws:')) {
            streamUrl = streamUrl.replace('ws:', 'wss:');
        }

        playStream(null, streamUrl, playerTypeHint)
            .then(() => {
                hideLoadingScreen();
            })
            .catch(error => {
                showError(`فشل في بدء البث: ${error.message}`);
                hideLoadingScreen();
            });
    } catch (error) {
        showError("فشل تشغيل البث: " + error.message);
        hideLoadingScreen();
    }
}


function cleanupCurrentPlayers() {
    
    try {
        cleanupPlayer();
        
        const videoElement = document.getElementById('video-player');
        if (videoElement) {
            try {
                videoElement.pause();
                
                if (videoElement.src) {
                    URL.revokeObjectURL(videoElement.src);
                }
                
                videoElement.removeAttribute('src');
                videoElement.load();
            } catch (e) {
            }
        }
    } catch (e) {
    }
}

/**
 *
 * @param {string} message
 */
function showLoadingScreen(message) {
    const loadingOverlay = document.getElementById('loading');
    const progressMessage = document.querySelector('.progress-message');
    
    if (progressMessage) {
        progressMessage.textContent = message || "جاري التحميل...";
    }
    
    if (loadingOverlay) {
        loadingOverlay.style.display = 'flex';
    }
    
    const playerSpinner = document.querySelector('.player-loading-spinner');
    if (playerSpinner) {
        playerSpinner.style.display = 'block';
    }
}


function hideLoadingScreen() {
    const loadingOverlay = document.getElementById('loading');
    
    if (loadingOverlay) {
        loadingOverlay.style.display = 'none';
    }
    
    const playerSpinner = document.querySelector('.player-loading-spinner');
    if (playerSpinner) {
        playerSpinner.style.display = 'none';
    }
}

/**
 * @param {string} streamUrl
 * @param {string} quality
 */
function setupStreamPlayer(streamUrl, quality = 'auto') {
        
    handleStreamUrl(streamUrl);
} 