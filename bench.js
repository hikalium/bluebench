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

const log = (div, s) => {
  div.innerText += s;
  div.innerText += '\n';
};

document.addEventListener('DOMContentLoaded', function() {
  const takeLogButton = document.getElementById('takeLogButton');
  const benchButton = document.getElementById('benchButton');
  const benchResultPre = document.getElementById('benchResultPre');
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
    let iterCount = 0;
    const runBenchAndProcess = async () => {
      iterCount++;
      const r = await runBench(numCycles, numTabs);
      log(benchResultPre, `${iterCount},raw,${r}`);
      result.push(r);
    };
    await runBenchAndProcess();
    await runBenchAndProcess();
    const pValueLimit = 1;
    for (let i = 0; i < 10; i++) {
      while (true) {
        await runBenchAndProcess();
        let x1 = result[result.length - 1].flat();
        let x2 = result[result.length - 2].flat();
        let x3 = result[result.length - 3].flat();
        const t1 = ttest(x1, x2);
        const t2 = ttest(x2, x3);
        const t3 = ttest(x3, x1);
        // log(benchResultPre, `${iterCount},ttest(x1,x2),${t1}`);
        // log(benchResultPre, `${iterCount},ttest(x2,x3),${t2}`);
        // log(benchResultPre, `${iterCount},ttest(x3,x1),${t3}`);
        //  log(benchResultPre, `${iterCount},mean(x1),${mean(x1)}`);
        //  log(benchResultPre, `${iterCount},mean(x2),${mean(x2)}`);
        //  log(benchResultPre, `${iterCount},mean(x3),${mean(x3)}`);
        if (t1 < pValueLimit && t2 < pValueLimit && t3 < pValueLimit) {
          log(benchResultPre, `${iterCount},result,converged,${mean([
                mean(x1), mean(x2), mean(x3)
              ])},${t1},${t2},${t3}`);
          break;
        } else {
          log(benchResultPre, `${iterCount},result,not_converged_yet,${mean([
                mean(x1), mean(x2), mean(x3)
              ])},${t1},${t2},${t3}`);
        }
      }
    }
  });
  async function takeLog(benchResultPre) {
    const biosInfo = await getInnerTextOfUrl('file:///var/log/bios_info.txt');
    const biosInfoLines = biosInfo.split('\n');
    const hwid = extractBiosInfoAttr(biosInfoLines, 'hwid');
    const fwid = extractBiosInfoAttr(biosInfoLines, 'fwid');
    log(benchResultPre, `0,hwid,${hwid}`);
    log(benchResultPre, `0,fwid,${fwid}`);
  }
  takeLogButton.addEventListener('click', async () => {
    await takeLog(benchResultPre);
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
