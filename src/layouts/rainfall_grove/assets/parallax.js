/**
 * Rainfall Grove — Parallax & Scroll Reveal Engine
 * ──────────────────────────────────────────────────
 * Reusable, configurable, RAF-optimized.
 *
 * Features:
 *   • Multi-layer parallax via data-parallax-speed attributes
 *   • translate3d transforms for GPU compositing
 *   • Scroll-triggered reveal via IntersectionObserver
 *   • Reduced-motion: automatically disabled when prefers-reduced-motion
 *   • Mobile-safe: parallax depth reduced on touch devices
 */

(function () {
    "use strict";

    // ── Config ────────────────────────────────────────────────────────────────
    const MOBILE_THRESHOLD = 768;
    const MOBILE_SCALE     = 0.4; // Reduce parallax depth on mobile

    // ── Reduced motion check ──────────────────────────────────────────────────
    const prefersReducedMotion = window.matchMedia
        ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
        : false;

    // ── State ─────────────────────────────────────────────────────────────────
    let scrollY      = 0;
    let ticking      = false;
    let isMobile     = window.innerWidth < MOBILE_THRESHOLD;
    let rafId        = null;

    // Collected parallax targets
    const parallaxTargets = [];

    // ── Parallax: collect all [data-parallax-speed] elements ─────────────────
    function collectParallaxTargets() {
        parallaxTargets.length = 0;

        // Hero layers
        document.querySelectorAll("[data-parallax-speed]").forEach(el => {
            const speed     = parseFloat(el.getAttribute("data-parallax-speed")) || 0;
            const rect      = el.getBoundingClientRect();
            const offsetTop = rect.top + window.scrollY;
            parallaxTargets.push({ el, speed, offsetTop });
        });
    }

    // ── Apply parallax transforms ─────────────────────────────────────────────
    function applyParallax() {
        const scrollFactor = isMobile ? MOBILE_SCALE : 1.0;

        parallaxTargets.forEach(({ el, speed }) => {
            const dy = scrollY * speed * scrollFactor;
            el.style.transform = `translate3d(0, ${dy.toFixed(2)}px, 0)`;
        });
    }

    // ── RAF loop ──────────────────────────────────────────────────────────────
    function onScroll() {
        scrollY = window.scrollY;
        if (!ticking) {
            ticking = true;
            rafId   = requestAnimationFrame(() => {
                applyParallax();
                ticking = false;
            });
        }
    }

    // ── Scroll Reveal via IntersectionObserver ────────────────────────────────
    function initReveal() {
        const revealRoot = document.querySelectorAll("[data-rg-reveal]");
        if (!revealRoot.length) return;

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach(entry => {
                    if (!entry.isIntersecting) return;

                    const section = entry.target;
                    section.classList.add("rg-revealed");

                    // Stagger children
                    section.querySelectorAll("[data-rg-reveal-child]").forEach((child, i) => {
                        const delay = parseInt(child.style.getPropertyValue("--rg-stagger") || "0", 10)
                            || (i * 80);
                        setTimeout(() => {
                            child.classList.add("rg-revealed");
                        }, delay);
                    });

                    observer.unobserve(section);
                });
            },
            { threshold: 0.12, rootMargin: "0px 0px -60px 0px" }
        );

        revealRoot.forEach(el => observer.observe(el));
    }

    // ── Rain initialisation for non-hero sections ─────────────────────────────
    // The hero rain is pre-rendered as HTML. Additional rain containers
    // (.rg-rain--showcase, .rg-rain--cta) get dynamically populated here.
    function initDynamicRain() {
        const containers = document.querySelectorAll(".rg-rain--showcase, .rg-rain--cta");
        containers.forEach(container => {
            if (container.children.length) return; // already populated

            const count = container.classList.contains("rg-rain--cta") ? 80 : 60;
            const frag  = document.createDocumentFragment();

            for (let i = 0; i < count; i++) {
                const drop = document.createElement("div");
                drop.className = "rg-rain-drop";
                const left     = Math.random() * 100;
                const delay    = (Math.random() * 8).toFixed(2);
                const duration = (0.9 + Math.random() * 1.0).toFixed(2);
                const opacity  = (0.15 + Math.random() * 0.45).toFixed(2);
                const width    = (0.5 + Math.random() * 1.2).toFixed(1);
                const height   = (10 + Math.random() * 22).toFixed(0);
                drop.style.cssText =
                    `left:${left.toFixed(1)}%;` +
                    `animation-delay:-${delay}s;` +
                    `animation-duration:${duration}s;` +
                    `opacity:${opacity};` +
                    `width:${width}px;` +
                    `height:${height}px;`;
                frag.appendChild(drop);
            }
            container.appendChild(frag);
        });
    }

    // ── Resize handler ────────────────────────────────────────────────────────
    function onResize() {
        isMobile = window.innerWidth < MOBILE_THRESHOLD;
        collectParallaxTargets();
    }

    // ── Init ──────────────────────────────────────────────────────────────────
    function init() {
        if (prefersReducedMotion) {
            // Still init reveal (no motion) — just skip parallax
            initReveal();
            initDynamicRain();
            return;
        }

        // Parallax only if the hero declares it
        const heroEl = document.querySelector("[data-rg-parallax=\"true\"]");
        if (heroEl) {
            collectParallaxTargets();
            window.addEventListener("scroll", onScroll, { passive: true });
            window.addEventListener("resize", onResize, { passive: true });
            // Initial position
            onScroll();
        }

        initReveal();
        initDynamicRain();
    }

    // ── Boot ──────────────────────────────────────────────────────────────────
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

    // ── Cleanup for hot reload ────────────────────────────────────────────────
    window.__rgParallaxCleanup = function () {
        window.removeEventListener("scroll", onScroll);
        window.removeEventListener("resize", onResize);
        if (rafId) cancelAnimationFrame(rafId);
    };

})();
