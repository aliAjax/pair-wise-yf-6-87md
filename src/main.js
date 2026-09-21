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
  am: "上午 09:00-12:00",
  pm: "下午 13:00-17:00",
  eve: "晚上 18:00-21:00"
};

const defaultWorkers = [
  { id: "worker-wang", name: "王师傅", skill: "水电维修" },
  { id: "worker-li", name: "李师傅", skill: "木工家具" },
  { id: "worker-zhao", name: "赵师傅", skill: "家电设备" }
];

let notice = null;
let state = loadState();
const app = document.querySelector("#app");

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) return migrate(JSON.parse(saved));
  return {
    filter: "all",
    budget: MONTHLY_BUDGET,
    workers: defaultWorkers,
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
        slotDate: "",
        slotPeriod: "",
        actualCost: null
      }
    ]
  };
}

// 旧数据没有派工和额度字段：补默认值，占用按预计费用计算
function migrate(saved) {
  return {
    filter: saved.filter && statuses[saved.filter] ? saved.filter : "all",
    budget: Number(saved.budget) > 0 ? Number(saved.budget) : MONTHLY_BUDGET,
    workers: Array.isArray(saved.workers) && saved.workers.length ? saved.workers : defaultWorkers,
    repairs: (Array.isArray(saved.repairs) ? saved.repairs : []).map((repair) => ({
      workerId: null,
      slotDate: "",
      slotPeriod: "",
      actualCost: null,
      ...repair,
      status: statuses[repair.status] && repair.status !== "all" ? repair.status : "todo"
    }))
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// 处理中/待确认按预计费用占用；已完成按实际费用（旧数据无实际费用时按预计）占用
function occupiedAmount(repair) {
  if (repair.status === "doing" || repair.status === "confirm") return Number(repair.cost || 0);
  if (repair.status === "done") return Number(repair.actualCost ?? repair.cost ?? 0);
  return 0;
}

function usedBudget() {
  return state.repairs.reduce((total, repair) => total + occupiedAmount(repair), 0);
}

function workerName(id) {
  const worker = state.workers.find((item) => item.id === id);
  return worker ? `${worker.name}（${worker.skill}）` : "未指派";
}

function hasSlotConflict(workerId, slotDate, slotPeriod, excludeId) {
  return state.repairs.some(
    (repair) =>
      repair.id !== excludeId &&
      (repair.status === "doing" || repair.status === "confirm") &&
      repair.workerId === workerId &&
      repair.slotDate === slotDate &&
      repair.slotPeriod === slotPeriod
  );
}

function render() {
  const repairs = filteredRepairs();
  const unfinished = state.repairs.filter((repair) => repair.status !== "done");
  const confirming = state.repairs.filter((repair) => repair.status === "confirm").length;
  const used = usedBudget();
  const remaining = state.budget - used;
  const usedPercent = Math.min(100, Math.round((used / state.budget) * 100));

  app.innerHTML = `
    <main class="shell">
      <header class="header">
        <div>
          <p class="eyebrow">本地家庭维护台 · 派工版</p>
          <h1>家庭维修派工台</h1>
        </div>
        <section class="stats">
          <div class="stat"><span>未完成</span><strong>${unfinished.length}</strong></div>
          <div class="stat"><span>待确认</span><strong>${confirming}</strong></div>
          <div class="stat"><span>本月额度</span><strong>¥${used} / ¥${state.budget}</strong></div>
          <div class="stat"><span>剩余额度</span><strong class="${remaining < 0 ? "danger" : ""}">¥${remaining}</strong></div>
        </section>
      </header>

      <div class="budget-bar"><span style="width: ${usedPercent}%"></span></div>

      ${notice ? `<div class="notice ${notice.type}">${escapeHtml(notice.text)}</div>` : ""}

      <section class="board">
        ${state.workers.map(renderWorker).join("")}
      </section>

      <section class="layout">
        <aside class="panel">
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
        </aside>

        <section>
          <div class="toolbar">
            ${Object.entries(statuses).map(([value, label]) => `<button class="seg ${state.filter === value ? "active" : ""}" data-filter="${value}">${label}</button>`).join("")}
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

function renderWorker(worker) {
  const jobs = state.repairs.filter(
    (repair) => repair.workerId === worker.id && (repair.status === "doing" || repair.status === "confirm")
  );
  return `
    <article class="worker">
      <div class="row">
        <h3>${escapeHtml(worker.name)}</h3>
        <span class="chip">${escapeHtml(worker.skill)}</span>
      </div>
      ${
        jobs.length
          ? jobs
              .map(
                (job) => `
            <div class="job">
              <strong>${escapeHtml(job.slotDate)} ${periods[job.slotPeriod] || ""}</strong>
              <span>${escapeHtml(job.location)} · ${escapeHtml(job.title)}（占用 ¥${Number(job.cost || 0)}）</span>
            </div>`
              )
              .join("")
          : `<p class="idle">暂无排期</p>`
      }
    </article>
  `;
}

function renderRepair(repair) {
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
          ${repair.workerId ? `<span class="chip">${escapeHtml(workerName(repair.workerId))} · ${escapeHtml(repair.slotDate)} ${periods[repair.slotPeriod] || ""}</span>` : ""}
          ${repair.actualCost != null ? `<span class="chip">实际 ¥${Number(repair.actualCost)}</span>` : ""}
          <span class="chip">${escapeHtml(repair.note || "暂无备注")}</span>
        </div>
        ${renderActions(repair)}
      </div>
    </article>
  `;
}

function renderActions(repair) {
  if (repair.status === "todo") {
    return `
      <form class="dispatch-form" data-id="${repair.id}">
        <select name="workerId" required>
          <option value="">选择师傅</option>
          ${state.workers.map((worker) => `<option value="${worker.id}">${escapeHtml(worker.name)} · ${escapeHtml(worker.skill)}</option>`).join("")}
        </select>
        <input name="slotDate" type="date" required>
        <select name="slotPeriod" required>
          <option value="">选择时段</option>
          ${Object.entries(periods).map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}
        </select>
        <button class="primary" type="submit">派工（占用 ¥${Number(repair.cost || 0)}）</button>
      </form>
      <div class="actions">
        <button class="ghost" data-delete="${repair.id}">删除</button>
      </div>
    `;
  }

  if (repair.status === "doing") {
    return `
      <form class="complete-form" data-id="${repair.id}">
        <input name="actualCost" type="number" min="0" step="1" required placeholder="实际费用 ¥">
        <button class="primary" type="submit">完工登记</button>
        <button class="ghost" type="button" data-cancel="${repair.id}">取消派工</button>
      </form>
    `;
  }

  if (repair.status === "confirm") {
    const extra = Number(repair.actualCost || 0) - Number(repair.cost || 0);
    return `
      <div class="actions">
        <span class="chip warn">登记 ¥${Number(repair.actualCost || 0)}，超出预计 ¥${extra}，仍占用原额度 ¥${Number(repair.cost || 0)}</span>
        <button class="primary" data-confirm="${repair.id}">确认追加 ¥${extra} 并完成</button>
        <button class="ghost" data-delete="${repair.id}">删除</button>
      </div>
    `;
  }

  return `
    <div class="actions">
      <button class="ghost" data-delete="${repair.id}">删除</button>
    </div>
  `;
}

function renderPriorityOptions(selected) {
  return Object.entries(priorities)
    .map(([value, label]) => `<option value="${value}" ${selected === value ? "selected" : ""}>${label}</option>`)
    .join("");
}

function bindEvents() {
  document.querySelector("#repair-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target));
    state.repairs.unshift({
      id: crypto.randomUUID(),
      location: data.location.trim(),
      title: data.title.trim(),
      priority: data.priority,
      cost: Number(data.cost || 0),
      status: "todo",
      photo: data.photo.trim(),
      note: data.note.trim(),
      workerId: null,
      slotDate: "",
      slotPeriod: "",
      actualCost: null
    });
    notice = { type: "ok", text: "事项已保存，等待派工" };
    saveState();
    render();
  });

  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.filter = button.dataset.filter;
      saveState();
      render();
    });
  });

  document.querySelectorAll(".dispatch-form").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const repair = state.repairs.find((item) => item.id === form.dataset.id);
      if (!repair) return;
      const data = Object.fromEntries(new FormData(form));
      dispatchRepair(repair, data);
      saveState();
      render();
    });
  });

  document.querySelectorAll(".complete-form").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const repair = state.repairs.find((item) => item.id === form.dataset.id);
      if (!repair) return;
      const data = Object.fromEntries(new FormData(form));
      completeRepair(repair, Number(data.actualCost));
      saveState();
      render();
    });
  });

  document.querySelectorAll("[data-confirm]").forEach((button) => {
    button.addEventListener("click", () => {
      const repair = state.repairs.find((item) => item.id === button.dataset.confirm);
      if (!repair) return;
      repair.status = "done";
      notice = { type: "ok", text: `已确认追加费用，「${repair.location}」完工，按实际 ¥${Number(repair.actualCost || 0)} 占用额度` };
      saveState();
      render();
    });
  });

  document.querySelectorAll("[data-cancel]").forEach((button) => {
    button.addEventListener("click", () => {
      const repair = state.repairs.find((item) => item.id === button.dataset.cancel);
      if (!repair) return;
      repair.status = "todo";
      repair.workerId = null;
      repair.slotDate = "";
      repair.slotPeriod = "";
      repair.actualCost = null;
      notice = { type: "ok", text: "已取消派工，额度和时段已释放" };
      saveState();
      render();
    });
  });

  document.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      state.repairs = state.repairs.filter((repair) => repair.id !== button.dataset.delete);
      notice = null;
      saveState();
      render();
    });
  });
}

// 派工：同一师傅同一时段只能接一项；预计费用占用额度。冲突或额度不足整次拒绝
function dispatchRepair(repair, data) {
  const cost = Number(repair.cost || 0);
  if (hasSlotConflict(data.workerId, data.slotDate, data.slotPeriod, repair.id)) {
    notice = { type: "error", text: "派工被拒绝：该师傅此时段已有安排，事项和排期保持不变" };
    return;
  }
  const remaining = state.budget - usedBudget();
  if (cost > remaining) {
    notice = { type: "error", text: `派工被拒绝：预计 ¥${cost} 超出剩余额度 ¥${remaining}，事项和排期保持不变` };
    return;
  }
  repair.workerId = data.workerId;
  repair.slotDate = data.slotDate;
  repair.slotPeriod = data.slotPeriod;
  repair.status = "doing";
  notice = { type: "ok", text: `已派工给${workerName(data.workerId)}，占用额度 ¥${cost}` };
}

// 完工登记：未超额直接完成；超额进入待确认，继续占用原额度
function completeRepair(repair, actualCost) {
  if (!Number.isFinite(actualCost) || actualCost < 0) {
    notice = { type: "error", text: "请填写有效的实际费用" };
    return;
  }
  repair.actualCost = actualCost;
  if (actualCost <= Number(repair.cost || 0)) {
    repair.status = "done";
    notice = { type: "ok", text: `「${repair.location}」已完工，按实际 ¥${actualCost} 结算额度` };
  } else {
    repair.status = "confirm";
    notice = { type: "error", text: `实际 ¥${actualCost} 超出预计 ¥${Number(repair.cost || 0)}，已进入待确认，确认追加后才完成` };
  }
}

function filteredRepairs() {
  if (state.filter === "all") return state.repairs;
  return state.repairs.filter((repair) => repair.status === state.filter);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}

render();
