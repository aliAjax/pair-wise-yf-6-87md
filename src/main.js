import "./styles.css";

const STORAGE_KEY = "zfl-14-repairs";
const MONTHLY_BUDGET = 800;

const statuses = {
  all: "全部",
  todo: "待处理",
  doing: "处理中",
  confirm: "待确认",
  done: "已完成"
};

const priorities = {
  high: "高优先级",
  medium: "中优先级",
  low: "低优先级"
};

const periods = {
  am: "上午",
  pm: "下午"
};

const defaultWorkers = [
  { id: "worker-wang", name: "王师傅", skill: "水电维修" },
  { id: "worker-li", name: "李师傅", skill: "木工门窗" },
  { id: "worker-zhao", name: "赵师傅", skill: "综合维修" }
];

let state = loadState();
let notice = null;
const app = document.querySelector("#app");

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function todayStr() {
  const now = new Date();
  return `${currentMonth()}-${String(now.getDate()).padStart(2, "0")}`;
}

function freshState() {
  const workers = defaultWorkers.map((worker) => ({ ...worker }));
  return {
    filter: "all",
    workers,
    budgetBase: MONTHLY_BUDGET,
    extraBudget: 0,
    budgetMonth: currentMonth(),
    dispatch: { repairId: "", workerId: workers[0].id, date: todayStr(), period: "am" },
    repairs: [
      {
        id: crypto.randomUUID(),
        location: "厨房",
        title: "水槽下方渗水",
        priority: "high",
        cost: 260,
        status: "todo",
        photo: "",
        note: "先检查软管接口",
        workerId: null,
        slot: null,
        actualCost: null
      },
      {
        id: crypto.randomUUID(),
        location: "卫生间",
        title: "排气扇异响，需要拆检",
        priority: "medium",
        cost: 120,
        status: "doing",
        photo: "",
        note: "已电话约好时间",
        workerId: workers[0].id,
        slot: `${todayStr()}|am`,
        actualCost: null
      },
      {
        id: crypto.randomUUID(),
        location: "主卧",
        title: "窗户密封条老化",
        priority: "low",
        cost: 90,
        status: "todo",
        photo: "",
        note: "",
        workerId: null,
        slot: null,
        actualCost: null
      }
    ]
  };
}

function normalizeRepair(repair) {
  const validStatus = ["todo", "doing", "confirm", "done"];
  return {
    id: repair.id || crypto.randomUUID(),
    location: repair.location || "",
    title: repair.title || "",
    priority: priorities[repair.priority] ? repair.priority : "medium",
    cost: Number(repair.cost) || 0,
    status: validStatus.includes(repair.status) ? repair.status : "todo",
    photo: repair.photo || "",
    note: repair.note || "",
    workerId: repair.workerId ?? null,
    slot: repair.slot ?? null,
    actualCost: Number.isFinite(Number(repair.actualCost)) ? Number(repair.actualCost) : null
  };
}

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const data = JSON.parse(saved);
      const workers =
        Array.isArray(data.workers) && data.workers.length
          ? data.workers.map((worker) => ({ id: worker.id, name: worker.name, skill: worker.skill || "" }))
          : defaultWorkers.map((worker) => ({ ...worker }));
      const repairs = Array.isArray(data.repairs) ? data.repairs.map(normalizeRepair) : [];
      return {
        filter: statuses[data.filter] ? data.filter : "all",
        workers,
        // 旧记录没有额度字段时，预置本月 800 元额度
        budgetBase: Number.isFinite(Number(data.budgetBase)) ? Number(data.budgetBase) : MONTHLY_BUDGET,
        extraBudget: Number.isFinite(Number(data.extraBudget)) ? Number(data.extraBudget) : 0,
        budgetMonth: data.budgetMonth || currentMonth(),
        dispatch: {
          repairId: "",
          workerId: workers[0].id,
          date: todayStr(),
          period: "am",
          ...(data.dispatch || {})
        },
        repairs
      };
    } catch {
      // 损坏的本地记录回退到初始数据
    }
  }
  return freshState();
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function isActive(repair) {
  return repair.status === "doing" || repair.status === "confirm";
}

function totalBudget() {
  return state.budgetBase + state.extraBudget;
}

function occupiedBudget() {
  // 已排期与待确认事项按预计费用占用额度；旧的处理中事项即使没有师傅排期也同样占用
  return state.repairs.filter(isActive).reduce((total, repair) => total + Number(repair.cost || 0), 0);
}

function spentBudget() {
  // 已完工按实际费用支出；旧完工记录没有实际费用时回落到预计费用
  return state.repairs
    .filter((repair) => repair.status === "done")
    .reduce((total, repair) => total + (repair.actualCost ?? Number(repair.cost || 0)), 0);
}

function remainingBudget() {
  return totalBudget() - spentBudget() - occupiedBudget();
}

function render() {
  const repairs = filteredRepairs();
  const todoCount = state.repairs.filter((repair) => repair.status === "todo").length;
  const doingCount = state.repairs.filter((repair) => repair.status === "doing").length;
  const confirmCount = state.repairs.filter((repair) => repair.status === "confirm").length;
  const occupied = occupiedBudget();
  const spent = spentBudget();
  const budget = totalBudget();
  const remaining = budget - spent - occupied;
  const spentPct = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;
  const occupiedPct = budget > 0 ? Math.min(100 - spentPct, (occupied / budget) * 100) : 0;

  app.innerHTML = `
    <main class="shell">
      <header class="header">
        <div>
          <p class="eyebrow">本地家庭维护台</p>
          <h1>家庭维修派工台</h1>
        </div>
        <section class="stats">
          <div class="stat"><span>待处理</span><strong>${todoCount}</strong></div>
          <div class="stat"><span>处理中</span><strong>${doingCount}</strong></div>
          <div class="stat"><span>待确认</span><strong>${confirmCount}</strong></div>
        </section>
      </header>

      <section class="budget panel">
        <div class="budget-head">
          <h2>本月额度（${escapeHtml(state.budgetMonth)}）</h2>
          <div class="budget-numbers">
            <span>总额度 <strong>¥${budget}</strong></span>
            <span>已支出 <strong class="spent-text">¥${spent}</strong></span>
            <span>已占用 <strong class="occupied-text">¥${occupied}</strong></span>
            <span>剩余可用 <strong class="${remaining < 0 ? "over" : ""}">¥${remaining}</strong></span>
          </div>
        </div>
        <div class="bar" title="绿色已支出 / 黄色已占用">
          <i class="bar-spent" style="width:${spentPct}%"></i>
          <i class="bar-occupied" style="width:${occupiedPct}%"></i>
        </div>
        <p class="budget-tip">基础额度 ¥${state.budgetBase}${state.extraBudget > 0 ? `，已确认追加 ¥${state.extraBudget}` : "，暂无追加"}；派工按预计费用占用，完工后按实际费用结算。</p>
      </section>

      <section class="layout">
        <aside class="side">
          <section class="panel">
            <h2>新增维修事项</h2>
            <form class="form" id="repair-form">
              <label>位置<input name="location" required placeholder="例如卫生间"></label>
              <label>问题描述<textarea name="title" required placeholder="例如门锁松动"></textarea></label>
              <label>优先级<select name="priority">${renderPriorityOptions("medium")}</select></label>
              <label>预计费用<input name="cost" type="number" min="0" step="1" value="0"></label>
              <label>照片链接<input name="photo" type="url" placeholder="可选，粘贴图片地址"></label>
              <label>备注<textarea name="note" placeholder="师傅电话、材料或注意事项"></textarea></label>
              <button class="primary" type="submit">保存事项</button>
            </form>
          </section>

          <section class="panel">
            <h2>安排派工</h2>
            <form class="form" id="dispatch-form">
              <label>待处理事项
                <select name="repairId" required>${renderTodoOptions()}</select>
              </label>
              <label>师傅
                <select name="workerId" required>${renderWorkerOptions(state.dispatch.workerId)}</select>
              </label>
              <label class="grid-two">
                <span>日期<input name="date" type="date" value="${escapeHtml(state.dispatch.date)}" required></span>
                <span>时段<select name="period">${renderPeriodOptions(state.dispatch.period)}</select></span>
              </label>
              <button class="primary" type="submit">安排派工</button>
              <p class="hint">同一师傅同一时段只能接一项；预计费用超过剩余额度或时段冲突时，整次拒绝，事项与排期不变。</p>
            </form>
          </section>

          <section class="panel">
            <h2>师傅排期</h2>
            <div class="workers">${renderWorkers()}</div>
          </section>
        </aside>

        <section>
          ${notice ? `<div class="flash ${notice.type}">${escapeHtml(notice.text)}</div>` : ""}
          <div class="toolbar">
            ${Object.entries(statuses)
              .map(
                ([value, label]) =>
                  `<button class="seg ${state.filter === value ? "active" : ""}" data-filter="${value}">${label}</button>`
              )
              .join("")}
          </div>
          <div class="repairs">
            ${repairs.length ? repairs.map(renderRepair).join("") : `<div class="empty">当前状态下没有维修事项</div>`}
          </div>
        </section>
      </section>
    </main>
  `;

  bindEvents();
}

function renderRepair(repair) {
  const worker = state.workers.find((item) => item.id === repair.workerId);
  const actual = repair.actualCost ?? Number(repair.cost || 0);
  let extra = "";
  if (repair.status === "confirm") {
    const occupiedOther = occupiedBudget() - Number(repair.cost || 0);
    const deficit = Math.max(0, spentBudget() + occupiedOther + actual - totalBudget());
    extra = `
      <div class="confirm-box">
        实际费用 <strong>¥${actual}</strong>，将超出额度 <strong>¥${deficit}</strong>。
        事项待确认追加，仍按预计 <strong>¥${Number(repair.cost || 0)}</strong> 占用额度。
      </div>`;
  }

  return `
    <article class="repair">
      <div class="photo">${repair.photo ? `<img src="${escapeHtml(repair.photo)}" alt="${escapeHtml(repair.location)}维修照片">` : "未添加照片"}</div>
      <div class="content">
        <div class="row">
          <h3>${escapeHtml(repair.location)}</h3>
          <span class="priority ${repair.priority}">${priorities[repair.priority]}</span>
          <span class="status ${repair.status}">${statuses[repair.status]}</span>
        </div>
        <p>${escapeHtml(repair.title)}</p>
        <div class="row">
          <span class="chip">预计 ¥${Number(repair.cost || 0)}</span>
          ${repair.status === "done" ? `<span class="chip actual">实际 ¥${actual}</span>` : ""}
          ${isActive(repair) && worker ? `<span class="chip schedule">${escapeHtml(worker.name)} · ${slotLabel(repair.slot)}</span>` : ""}
          ${isActive(repair) && !worker ? `<span class="chip schedule">历史事项 · 无师傅排期</span>` : ""}
          <span class="chip">${escapeHtml(repair.note || "暂无备注")}</span>
        </div>
        ${extra}
        <div class="actions">${renderActions(repair)}</div>
      </div>
    </article>
  `;
}

function renderActions(repair) {
  if (repair.status === "todo") {
    return `<button class="ghost danger" data-delete="${repair.id}">删除</button>`;
  }
  if (repair.status === "doing") {
    return `
      <input class="actual-input" type="number" min="0" step="1" placeholder="登记实际费用" data-actual-input="${repair.id}">
      <button class="ghost" data-complete="${repair.id}">登记完工</button>
      <button class="ghost" data-cancel="${repair.id}">${repair.workerId ? "取消排期" : "转回待处理"}</button>
      <button class="ghost danger" data-delete="${repair.id}">删除</button>
    `;
  }
  if (repair.status === "confirm") {
    return `
      <button class="primary small" data-approve="${repair.id}">确认追加并完工</button>
      <button class="ghost" data-revert="${repair.id}">撤销登记</button>
      <button class="ghost danger" data-delete="${repair.id}">删除</button>
    `;
  }
  return `<button class="ghost danger" data-delete="${repair.id}">删除</button>`;
}

function renderTodoOptions() {
  const todos = state.repairs.filter((repair) => repair.status === "todo");
  if (!todos.length) return `<option value="">暂无待处理事项</option>`;
  const selected = todos.some((repair) => repair.id === state.dispatch.repairId) ? state.dispatch.repairId : todos[0].id;
  state.dispatch.repairId = selected;
  return todos
    .map(
      (repair) =>
        `<option value="${repair.id}" ${repair.id === selected ? "selected" : ""}>${escapeHtml(
          repair.location
        )} · ${escapeHtml(repair.title)}（预计 ¥${Number(repair.cost || 0)}）</option>`
    )
    .join("");
}

function renderWorkerOptions(selected) {
  return state.workers
    .map((worker) => `<option value="${worker.id}" ${worker.id === selected ? "selected" : ""}>${escapeHtml(worker.name)} · ${escapeHtml(worker.skill)}</option>`)
    .join("");
}

function renderPeriodOptions(selected) {
  return Object.entries(periods)
    .map(([value, label]) => `<option value="${value}" ${selected === value ? "selected" : ""}>${label}</option>`)
    .join("");
}

function renderPriorityOptions(selected) {
  return Object.entries(priorities)
    .map(([value, label]) => `<option value="${value}" ${selected === value ? "selected" : ""}>${label}</option>`)
    .join("");
}

function renderWorkers() {
  return state.workers
    .map((worker) => {
      const jobs = state.repairs
        .filter((repair) => isActive(repair) && repair.workerId === worker.id)
        .sort((a, b) => String(a.slot).localeCompare(String(b.slot)));
      return `
        <div class="worker">
          <div class="worker-head"><strong>${escapeHtml(worker.name)}</strong><span>${escapeHtml(worker.skill)}</span></div>
          ${
            jobs.length
              ? jobs
                  .map(
                    (job) => `
                    <div class="job">
                      <span class="slot">${slotLabel(job.slot)}</span>
                      <span class="status mini ${job.status}">${statuses[job.status]}</span>
                      <span class="job-title">${escapeHtml(job.location)} · ${escapeHtml(job.title)}</span>
                    </div>`
                  )
                  .join("")
              : `<p class="muted">暂无排期</p>`
          }
        </div>`;
    })
    .join("");
}

function slotLabel(slot) {
  if (!slot) return "时段待定";
  const [date, period] = String(slot).split("|");
  const parts = (date || "").split("-");
  const month = parts[1] ? Number(parts[1]) : "";
  const day = parts[2] ? Number(parts[2]) : "";
  return `${month}月${day}日 ${periods[period] || period || ""}`;
}

function bindEvents() {
  document.querySelector("#repair-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target));
    state.repairs.unshift(
      normalizeRepair({
        location: data.location.trim(),
        title: data.title.trim(),
        priority: data.priority,
        cost: Number(data.cost || 0),
        status: "todo",
        photo: data.photo.trim(),
        note: data.note.trim()
      })
    );
    event.target.reset();
    notice = { type: "ok", text: "维修事项已保存，可在派工面板安排师傅。" };
    saveState();
    render();
  });

  const dispatchForm = document.querySelector("#dispatch-form");
  dispatchForm.querySelectorAll("input, select").forEach((field) => {
    field.addEventListener("change", () => {
      const data = new FormData(dispatchForm);
      state.dispatch = {
        repairId: data.get("repairId") || "",
        workerId: data.get("workerId") || "",
        date: data.get("date") || todayStr(),
        period: data.get("period") || "am"
      };
      saveState();
    });
  });

  dispatchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(event.target);
    dispatchRepair({
      repairId: String(data.get("repairId") || ""),
      workerId: String(data.get("workerId") || ""),
      date: String(data.get("date") || ""),
      period: String(data.get("period") || "am")
    });
  });

  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.filter = button.dataset.filter;
      notice = null;
      saveState();
      render();
    });
  });

  document.querySelectorAll("[data-complete]").forEach((button) => {
    button.addEventListener("click", () => {
      const input = document.querySelector(`[data-actual-input="${button.dataset.complete}"]`);
      const raw = input?.value.trim() ?? "";
      if (raw === "") {
        setNotice("error", "请输入实际费用后再登记完工。");
        saveState();
        render();
        return;
      }
      completeRepair(button.dataset.complete, Number(raw));
    });
  });

  document.querySelectorAll("[data-approve]").forEach((button) => {
    button.addEventListener("click", () => approveExtra(button.dataset.approve));
  });

  document.querySelectorAll("[data-revert]").forEach((button) => {
    button.addEventListener("click", () => revertCompletion(button.dataset.revert));
  });

  document.querySelectorAll("[data-cancel]").forEach((button) => {
    button.addEventListener("click", () => cancelSchedule(button.dataset.cancel));
  });

  document.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      state.repairs = state.repairs.filter((repair) => repair.id !== button.dataset.delete);
      notice = { type: "ok", text: "事项已删除，相关额度占用同步释放。" };
      saveState();
      render();
    });
  });
}

// 派工：先做时段冲突与剩余额度两项校验，任一不通过则整次拒绝，不改动事项与排期
function dispatchRepair({ repairId, workerId, date, period }) {
  // 校验失败时整次拒绝：仅刷新提示，不写入任何状态
  const reject = (type, text) => {
    setNotice(type, text);
    render();
  };
  const repair = state.repairs.find((item) => item.id === repairId && item.status === "todo");
  const worker = state.workers.find((item) => item.id === workerId);
  if (!repair) {
    reject("error", "请选择待处理事项。");
    return;
  }
  if (!worker || !date) {
    reject("error", "请完善师傅与上门日期。");
    return;
  }

  const slot = `${date}|${period}`;
  const conflict = state.repairs.find((item) => isActive(item) && item.workerId === workerId && item.slot === slot);
  if (conflict) {
    reject(
      "error",
      `派工被拒绝：${worker.name} ${slotLabel(slot)} 已有安排（${conflict.location} · ${conflict.title}），时段冲突，事项与排期均未改变。`
    );
    return;
  }

  const cost = Number(repair.cost || 0);
  const remaining = remainingBudget();
  if (cost > remaining) {
    reject(
      "error",
      `派工被拒绝：预计费用 ¥${cost} 超过本月剩余额度 ¥${remaining}，事项与排期均未改变。`
    );
    return;
  }

  repair.status = "doing";
  repair.workerId = workerId;
  repair.slot = slot;
  repair.actualCost = null;
  state.dispatch.repairId = "";
  setNotice("ok", `派工成功：${worker.name} ${slotLabel(slot)} 上门，已按预计费用占用 ¥${cost}。`);
  saveState();
  render();
}

// 完工登记实际费用：未超额直接完成；超额进入待确认，继续按预计费用占用
function completeRepair(id, actual) {
  const repair = state.repairs.find((item) => item.id === id);
  if (!repair || !isActive(repair)) return;
  if (!Number.isFinite(actual) || actual < 0) {
    setNotice("error", "请输入不小于 0 的实际费用。");
    return;
  }

  const occupiedOther = occupiedBudget() - Number(repair.cost || 0);
  repair.actualCost = actual;

  if (spentBudget() + occupiedOther + actual <= totalBudget()) {
    repair.status = "done";
    setNotice("ok", `完工已登记，实际费用 ¥${actual}，已结算并释放预计占用。`);
  } else {
    repair.status = "confirm";
    const deficit = Math.max(0, spentBudget() + occupiedOther + actual - totalBudget());
    setNotice("error", `实际费用 ¥${actual} 将超出本月额度 ¥${deficit}，事项进入待确认，仍按预计 ¥${Number(repair.cost || 0)} 占用额度。`);
  }
  saveState();
  render();
}

// 确认追加：补足额度缺口后完工，预计占用转为实际支出
function approveExtra(id) {
  const repair = state.repairs.find((item) => item.id === id && item.status === "confirm");
  if (!repair) return;
  const actual = repair.actualCost ?? Number(repair.cost || 0);
  const occupiedOther = occupiedBudget() - Number(repair.cost || 0);
  const deficit = Math.max(0, spentBudget() + occupiedOther + actual - totalBudget());
  state.extraBudget += deficit;
  repair.status = "done";
  setNotice("ok", `已确认追加额度 ¥${deficit}，事项完工，实际支出 ¥${actual}。`);
  saveState();
  render();
}

function revertCompletion(id) {
  const repair = state.repairs.find((item) => item.id === id);
  if (!repair || repair.status !== "confirm") return;
  repair.status = "doing";
  repair.actualCost = null;
  setNotice("ok", "已撤销完工登记，恢复为处理中并继续按预计费用占用额度。");
  saveState();
  render();
}

function cancelSchedule(id) {
  const repair = state.repairs.find((item) => item.id === id);
  if (!repair || !isActive(repair)) return;
  repair.status = "todo";
  repair.workerId = null;
  repair.slot = null;
  repair.actualCost = null;
  setNotice("ok", "已取消排期，事项回到待处理，占用额度同步释放。");
  saveState();
  render();
}

function setNotice(type, text) {
  notice = { type, text };
}

function filteredRepairs() {
  if (state.filter === "all") return state.repairs;
  return state.repairs.filter((repair) => repair.status === state.filter);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}

render();
