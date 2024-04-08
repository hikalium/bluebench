function sleep(time) {
  return new Promise((resolve) => {setTimeout(resolve, time)})
}

function getInnerTextOfTab(tabId) {
  return new Promise((resolve) => {
    chrome.scripting.executeScript(
        {
          func: () => {
            return document.body.innerText;
          },
          target: {
            tabId: tabId,
          }
        },
        (injectionResults) => {
          for (const frameResult of injectionResults) {
            const result = frameResult.result;
            resolve(result);
          }
        });
  });
}

async function getInnerTextOfUrl(url) {
  const tab = await chrome.tabs.create({url: url, active: false});
  const text = await getInnerTextOfTab(tab.id);
  await chrome.tabs.remove(tab.id);
  return text;
}

function extractBiosInfoAttr(biosInfoLines, key) {
  return biosInfoLines.filter((s) => s.startsWith(key))[0]
      .split(' = ')[1]
      .split('#')[0]
      .trim();
}

async function takeLog(benchResultDiv) {
  const biosInfo = await getInnerTextOfUrl('file:///var/log/bios_info.txt');
  // console.log(biosInfo);
  const biosInfoLines = biosInfo.split('\n');
  const hwid = extractBiosInfoAttr(biosInfoLines, 'hwid');
  benchResultDiv.innerText += `hwid: ${hwid}\n`;
  const fwid = extractBiosInfoAttr(biosInfoLines, 'fwid');
  benchResultDiv.innerText += `fwid: ${fwid}\n`;
}

const runCycle = async function(numTabs) {
  // returns: tab open latencies: [Number; numTabs]
  const result = [];
  const tabIdToBeRemovedList = [];
  for (let i = 0; i < numTabs; i++) {
    const t0 = performance.now();
    const tid =
        (await chrome.tabs.create({url: 'nothing.html', active: false})).id;
    while (true) {
      const t = await chrome.tabs.get(tid);
      if (t.status === 'complete') {
        tabIdToBeRemovedList.push(tid);
        break;
      }
    }
    const t1 = performance.now();
    const diff = t1 - t0;
    result.push(diff);
  }
  for (const tabId of tabIdToBeRemovedList) {
    do {
      try {
        await chrome.tabs.remove(tabId);
      } catch {
        console.log('Remove failed. Retrying.')
        continue;
      }
    } while (0)
  }
  return result;
};

const runBench = async function(numCycles, numTabs) {
  // returns: latencies: [[Number; iterCount]; numCycles]
  const result = [];
  for (let i = 0; i < numCycles; i++) {
    result.push(await runCycle(numTabs));
  }
  return result;
};

document.addEventListener('DOMContentLoaded', function() {
  const chart = bb.generate({
    bindto: '#chart',
    legend: {show: false},
    data: {
      type: 'scatter',
      json: {},
    },
    axis: {
      x: {label: 'Effective tabs opened'},
      y: {label: 'Time took (ms)'},
    }
  });
  const histChart = bb.generate({
    bindto: '#histChart',
    legend: {show: false},
    title: {text: 'Time distribution'},
    data: {
      type: 'step',
      json: {},
    },
    axis: {
      x: {label: 'Time range (ms, left inclusive)'},
      y: {label: 'Frequency'},
    },
    line: {step: {type: 'step-after', tooltipMatch: true}},
  });
  const totalHistChart = bb.generate({
    bindto: '#totalHistChart',
    legend: {show: false},
    title: {text: 'Time distribution (All data)'},
    data: {
      type: 'step',
      json: {},
    },
    axis: {
      x: {label: 'Time range (ms, left inclusive)'},
      y: {label: 'Frequency'},
    },
    line: {step: {type: 'step-after', tooltipMatch: true}},
  });
  const takeLogButton = document.getElementById('takeLogButton');
  const benchButton = document.getElementById('benchButton');
  const benchResultDiv = document.getElementById('benchResultDiv');
  const histogramStepWidth = 10;
  const histogramNumSteps = 30;
  const totalHistogram = [];
  const totalHistogramXList = [];
  let runCount = 0;
  for (let i = 0; i < histogramNumSteps; i++) {
    totalHistogram[i] = 0;
    totalHistogramXList[i] = i * histogramStepWidth;
  }
  benchButton.addEventListener('click', async () => {
    const numTabsInput = document.getElementById('numTabsInput');
    const numCyclesInput = document.getElementById('numCyclesInput');
    const numCycles = parseInt(numCyclesInput.value);
    const numTabs = parseInt(numTabsInput.value);
    const result = [];
    const runBenchAndProcess = async () => {
      const r = await runBench(numCycles, numTabs);
      console.log(r);
      result.push(r);
    };
    await runBenchAndProcess();
    await runBenchAndProcess();
    const pValueLimit = 1;
    while (true) {
      await runBenchAndProcess();
      let x1 = result[result.length - 1].flat();
      let x2 = result[result.length - 2].flat();
      let x3 = result[result.length - 3].flat();
      const t1 = ttest(x1, x2);
      const t2 = ttest(x2, x3);
      const t3 = ttest(x3, x1);
      console.log(t1);
      console.log(t2);
      console.log(t3);
      console.log(mean(x1));
      if (t1 < pValueLimit && t2 < pValueLimit && t3 < pValueLimit) {
        console.log('converged!');
        console.log(mean(x1));
        console.log(mean(x2));
        console.log(mean(x3));
        console.log((mean(x1) + mean(x2) + mean(x3)) / 3);
        break;
      }
    }
  });
  takeLogButton.addEventListener('click', async () => {
    await takeLog(benchResultDiv);
  });
});

function mean(x) {
  let sum = 0;
  for (const v of x) sum += v;
  return sum / x.length;
}
function variance(x) {
  const m = mean(x);
  let sum = 0;
  for (const v of x) sum += (v - m) * (v - m);
  return sum / x.length;
}
function ttest(x1, x2) {
  let mean1 = mean(x1);
  let mean2 = mean(x2);
  let v1 = variance(x1);
  let v2 = variance(x2);
  return (Math.abs(mean1 - mean2) / Math.sqrt(v1 / x1.length + v2 / x2.length));
}
