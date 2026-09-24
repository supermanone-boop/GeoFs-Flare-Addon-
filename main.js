(() => {
"use strict";

const ADDON_ID = "__systemRunnerModule__";

if (window[ADDON_ID]?.cleanup) {
    try { window[ADDON_ID].cleanup(); } catch (e) {}
}

const state = {
    firing: false,
    fireLoop: null,
    entities: [],
    keyHeld: false,
    uiContainer: null
};

const RESOURCE_A = "https://oc135.github.io/test6/flare1.png.png";
const RESOURCE_B = "https://raw.githubusercontent.com/supermanone-boop/model/main/smoke.glb";
const RESOURCE_C = "https://oc135.github.io/test/gunsound1.mp3";

const ELEMENT_SIZE = 2.5;
const ITEM_LIFETIME = 5800;
const LOOP_INTERVAL = 800;
const STEP_INTERVAL = 3;
const EFFECT_LIFETIME = 600;
const SCALE_INIT = 0.35;
const SCALE_MAX = 0.51;
const PARAM_GRAVITY = 6.2;
const SPEED_FACTOR = 80;
const AIR_DRAG = 0.85;

const audioController = new Audio();
audioController.src = RESOURCE_C;
audioController.loop = true;

function buildDisplay() {
    const container = document.createElement("div");
    container.id = `${ADDON_ID}_ui`;
    container.style.cssText = `
        position:fixed;top:80px;right:20px;z-index:10000;
        background:rgba(0,0,0,.75);color:#fff;padding:12px 16px;
        border-radius:8px;font-family:sans-serif;font-size:13px;
        box-shadow:0 4px 10px rgba(0,0,0,.5);
        border:1px solid rgba(255,255,255,.2);
        user-select:none;width:160px;
    `;

    container.innerHTML = `
        <div style="font-weight:bold;margin-bottom:8px;font-size:14px;text-align:center;">Module Control</div>
        <button id="${ADDON_ID}_btn" style="
            width:100%;padding:8px 0;background:#28a745;color:white;
            border:none;border-radius:4px;font-weight:bold;cursor:pointer;
        ">OFF (Hold 'I')</button>
        <div style="margin-top:8px;font-size:11px;color:#ccc;text-align:center;">
            Key: <b>I</b><br>
            Status: <span id="${ADDON_ID}_status" style="color:#ffc107;">Ready</span>
        </div>
    `;

    document.body.appendChild(container);
    state.uiContainer = container;

    const btn = document.getElementById(`${ADDON_ID}_btn`);

    btn.addEventListener("mousedown", executeStart);
    btn.addEventListener("mouseup", executeStop);
    btn.addEventListener("mouseleave", () => {
        if (!state.keyHeld) executeStop();
    });
    btn.addEventListener("touchstart", e => {
        e.preventDefault();
        executeStart();
    });
    btn.addEventListener("touchend", e => {
        e.preventDefault();
        executeStop();
    });
}

function refreshDisplay(isActive) {
    const btn = document.getElementById(`${ADDON_ID}_btn`);
    const status = document.getElementById(`${ADDON_ID}_status`);

    if (!btn || !status) return;

    btn.textContent = isActive ? "RUNNING..." : "OFF (Hold 'I')";
    btn.style.background = isActive ? "#dc3545" : "#28a745";
    status.textContent = isActive ? "Active" : "Ready";
    status.style.color = isActive ? "#28a745" : "#ffc107";
}

function processEffectModel(positionCartesian) {
    try {
        const startTime = performance.now();

        const dynamicScale = new Cesium.CallbackProperty(() => {
            const progress = Math.min(
                (performance.now() - startTime) / EFFECT_LIFETIME,
                1
            );
            return SCALE_INIT + (SCALE_MAX - SCALE_INIT) * progress;
        }, false);

        const dynamicColor = new Cesium.CallbackProperty(() => {
            const elapsed = performance.now() - startTime;
            const alpha = Math.max(
                1 - Math.pow(elapsed / EFFECT_LIFETIME, 1.5),
                0
            );
            return new Cesium.Color(0.12, 0.12, 0.12, alpha);
        }, false);

        const subEntity = geofs.api.viewer.entities.add({
            position: Cesium.Cartesian3.clone(positionCartesian),
            model: {
                uri: RESOURCE_B,
                scale: dynamicScale,
                color: dynamicColor,
                colorBlendMode: Cesium.ColorBlendMode.REPLACE
            }
        });

        state.entities.push(subEntity);

        setTimeout(() => {
            try {
                geofs.api.viewer.entities.remove(subEntity);
                state.entities = state.entities.filter(e => e !== subEntity);
            } catch (e) {}
        }, EFFECT_LIFETIME);

    } catch (e) {
        console.log("Process error", e);
    }
}

function processSingleUnit() {
    try {
        const aircraft = geofs.aircraft.instance;
        const htr = aircraft.htr;
        const lla = aircraft.llaLocation;

        if (!lla || !htr) return;

        const heading = Cesium.Math.toRadians(htr[0]);
        const pitch = Cesium.Math.toRadians(htr[1]);
        const roll = Cesium.Math.toRadians(htr[2] || 0);

        const fE = Math.sin(heading) * Math.cos(pitch);
        const fN = Math.cos(heading) * Math.cos(pitch);
        const fU = Math.sin(pitch);

        const vE =
            -Math.sin(heading) * Math.sin(pitch) * Math.cos(roll) +
            Math.cos(heading) * Math.sin(roll);

        const vN =
            -Math.cos(heading) * Math.sin(pitch) * Math.cos(roll) -
            Math.sin(heading) * Math.sin(roll);

        const vU = -Math.cos(pitch) * Math.cos(roll);

        const currentVelocity = (aircraft.vitesse || 0) * 0.514444;

        let vx = fE * currentVelocity + vE * SPEED_FACTOR;
        let vy = fN * currentVelocity + vN * SPEED_FACTOR;
        let vz = fU * currentVelocity + vU * SPEED_FACTOR;

        let currentCartesian =
            Cesium.Cartesian3.fromDegrees(lla[1], lla[0], lla[2]);

        const spawnTime = performance.now();
        let lastTime = spawnTime;

        const dynamicPosition = new Cesium.CallbackProperty(() => {
            const now = performance.now();
            let dt = (now - lastTime) / 1000;
            lastTime = now;

            if (dt <= 0) return currentCartesian;
            if (dt > 0.1) dt = 0.1;

            const totalElapsed = (now - spawnTime) / 1000;

            vz -= PARAM_GRAVITY * dt;

            if (totalElapsed > 0.15) {
                const dragFactor = Math.pow(AIR_DRAG, dt * 60);
                vx *= dragFactor;
                vy *= dragFactor;
                vz *= dragFactor;
            }

            const dx = vx * dt;
            const dy = vy * dt;
            const dz = vz * dt;

            const transform =
                Cesium.Transforms.eastNorthUpToFixedFrame(currentCartesian);

            const worldMovement =
                Cesium.Matrix4.multiplyByPointAsVector(
                    transform,
                    new Cesium.Cartesian3(dx, dy, dz),
                    new Cesium.Cartesian3()
                );

            Cesium.Cartesian3.add(
                currentCartesian,
                worldMovement,
                currentCartesian
            );

            return currentCartesian;
        }, false);

        const mainEntity = geofs.api.viewer.entities.add({
            position: dynamicPosition,
            billboard: {
                image: RESOURCE_A,
                sizeInMeters: true,
                width: ELEMENT_SIZE,
                height: ELEMENT_SIZE,
                scale: 1,
                color: Cesium.Color.WHITE.withAlpha(1),
                verticalOrigin: Cesium.VerticalOrigin.CENTER
            }
        });

        state.entities.push(mainEntity);

        const subInterval = setInterval(() => {
            processEffectModel(currentCartesian);
        }, STEP_INTERVAL);

        setTimeout(() => {
            try {
                clearInterval(subInterval);
                geofs.api.viewer.entities.remove(mainEntity);
                state.entities = state.entities.filter(e => e !== mainEntity);
            } catch (e) {}
        }, ITEM_LIFETIME);

    } catch (e) {
        console.log("Unit error", e);
    }
}

function runSequence() {
    if (!window.geofs || !geofs.aircraft?.instance || !geofs.api?.viewer) return;

    for (let i = 0; i < 5; i++) {
        setTimeout(() => {
            processSingleUnit();
        }, i * 35);
    }
}

function executeStart() {
    if (state.firing) return;

    state.firing = true;
    refreshDisplay(true);

    try {
        audioController.currentTime = 0;
        audioController.play().catch(() => {});
    } catch (e) {}

    runSequence();

    state.fireLoop = window.setInterval(() => {
        try {
            requestAnimationFrame(runSequence);
        } catch (e) {}
    }, LOOP_INTERVAL);
}

function executeStop() {
    state.firing = false;
    refreshDisplay(false);

    if (state.fireLoop) {
        clearInterval(state.fireLoop);
        state.fireLoop = null;
    }

    try {
        audioController.pause();
        audioController.currentTime = 0;
    } catch (e) {}
}

function handleKeyDown(e) {
    try {
        if (e.repeat) return;

        if (e.key === "i" || e.key === "I") {
            state.keyHeld = true;
            executeStart();
        }
    } catch (e) {}
}

function handleKeyUp(e) {
    try {
        if (e.key === "i" || e.key === "I") {
            state.keyHeld = false;
            executeStop();
        }
    } catch (e) {}
}

window.addEventListener("keydown", handleKeyDown, true);
window.addEventListener("keyup", handleKeyUp, true);
window.addEventListener("blur", () => executeStop(), true);

function cleanup() {
    executeStop();

    window.removeEventListener("keydown", handleKeyDown, true);
    window.removeEventListener("keyup", handleKeyUp, true);

    if (state.uiContainer) {
        state.uiContainer.remove();
    }

    state.entities.forEach(entity => {
        try {
            geofs.api.viewer.entities.remove(entity);
        } catch (e) {}
    });

    state.entities = [];
}

buildDisplay();

window[ADDON_ID] = { cleanup };

})();
