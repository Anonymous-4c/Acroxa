import { homeCfg } from "../utils.js";

export function parallaxSection(params) {
    const H = homeCfg(params);
    if (H.showParallax === false) return "";

    return `
        <section class="rg-parallax-showcase" aria-label="Showcase" data-rg-parallax-scene>
            <!-- Depth layer 1: sky backdrop -->
            <div class="rg-pxl rg-pxl--sky" data-parallax-speed="-0.2" aria-hidden="true"></div>

            <!-- Depth layer 2: far mountains/hills -->
            <div class="rg-pxl rg-pxl--hills" data-parallax-speed="-0.12" aria-hidden="true">
                <svg viewBox="0 0 1440 300" preserveAspectRatio="xMidYMax slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <path d="M0,200 Q180,80 360,180 Q540,260 720,140 Q900,30 1080,160 Q1260,270 1440,140 L1440,300 L0,300 Z" fill="currentColor" opacity="0.5"/>
                </svg>
            </div>

            <!-- Depth layer 3: mid-ground forest -->
            <div class="rg-pxl rg-pxl--forest-mid" data-parallax-speed="-0.06" aria-hidden="true">
                <svg viewBox="0 0 1440 380" preserveAspectRatio="xMidYMax slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <path d="M0,280 L25,200 L50,250 L75,160 L100,220 L125,180 L150,240 L175,150 L200,200 L225,170 L250,130 L275,200 L300,170 L325,130 L350,210 L375,160 L400,190 L425,120 L450,180 L475,150 L500,200 L525,140 L550,190 L575,150 L600,120 L625,190 L650,150 L675,220 L700,150 L725,200 L750,150 L775,220 L800,170 L825,140 L850,210 L875,170 L900,150 L925,200 L950,150 L975,210 L1000,150 L1025,190 L1050,150 L1075,220 L1100,170 L1125,140 L1150,210 L1175,170 L1200,150 L1225,200 L1250,150 L1275,210 L1300,150 L1325,190 L1350,160 L1375,220 L1400,170 L1440,150 L1440,380 L0,380 Z" fill="currentColor"/>
                </svg>
            </div>

            <!-- Depth layer 4: rain particles -->
            <div class="rg-pxl rg-pxl--rain" data-parallax-speed="0.08" aria-hidden="true">
                <div class="rg-rain rg-rain--showcase"></div>
            </div>

            <!-- Depth layer 5: ground mist -->
            <div class="rg-pxl rg-pxl--ground-mist" aria-hidden="true"></div>

            <!-- Content (minimal — let atmosphere speak) -->
            <div class="rg-container rg-parallax-showcase__content" data-parallax-speed="0.03">
                <blockquote class="rg-parallax-showcase__quote" data-rg-reveal-child>
                    <p>"The forest is not a place you enter.<br>It is a place that enters you."</p>
                    <cite>The Grove, Vol. I</cite>
                </blockquote>
            </div>
        </section>`;
}
