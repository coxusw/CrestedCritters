(() => {
  const KEY = "budget-lab-v1";
  const seed = {
    paycheck: { date: "2026-10-09", expected: 5500, actual: null, checkingBefore: 0 },
    discretionary: { currentEach: 200, proposalEach: 200, approvals: { chris: false, jen: false } },
    review: {
      unread: true,
      generated: false,
      previousSpend: 5120,
      narrative: "Your base plan fits the sample paycheck. Chris and Jen can each keep $200 discretionary spending and still leave a small amount unassigned."
    },
    expenses: [
      { id: 1, name: "Housing", amount: 1500, due: "Oct 12", category: "Housing", recurring: true },
      { id: 2, name: "Vehicle payments", amount: 900, due: "Oct 14", category: "Vehicle", recurring: true },
      { id: 3, name: "Groceries & household", amount: 600, due: "This period", category: "Household", recurring: false },
      { id: 4, name: "Utilities", amount: 500, due: "Oct 16", category: "Utilities", recurring: true },
      { id: 5, name: "Debt payments", amount: 760, due: "This period", category: "Debt", recurring: true },
      { id: 6, name: "Fuel", amount: 300, due: "This period", category: "Fuel", recurring: false },
      { id: 7, name: "Kids / activities", amount: 200, due: "This period", category: "Kids", recurring: false }
    ]
  };

  let state = load();

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY));
      return saved ? { ...seed, ...saved, discretionary: { ...seed.discretionary, ...(saved.discretionary || {}) } } : structuredClone(seed);
    } catch {
      return structuredClone(seed);
    }
  }

  function save() {
    localStorage.setItem(KEY, JSON.stringify(state));
  }

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const money = (n) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(n || 0));
  const money2 = (n) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(n || 0));

  function fmtDate(iso) {
    if (!iso) return "Oct 9, 2026";
    const [y,m,d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  function baseExpenses() {
    return state.expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  }

  function incomeUsed() {
    return Number(state.paycheck.actual || state.paycheck.expected || 0);
  }

  function plannedTotal(each = state.discretionary.currentEach) {
    return baseExpenses() + Number(each || 0) * 2;
  }

  function availableExtra(each = state.discretionary.currentEach) {
    return incomeUsed() - plannedTotal(each);
  }

  function icon(category) {
    const map = { Housing:"⌂", Vehicle:"◈", Household:"⌑", Utilities:"⚡", Debt:"↘", Fuel:"⛽", Kids:"★", Soccer:"⚽", Personal:"☺", Subscriptions:"◉" };
    return map[category] || "•";
  }

  function render() {
    $("#nextPayDate").textContent = fmtDate(state.paycheck.date);
    $("#expectedPay").textContent = money(state.paycheck.actual || state.paycheck.expected);
    $("#plannedTotal").textContent = money(plannedTotal());
    $("#availableExtra").textContent = money(availableExtra());
    $("#planHealth").textContent = availableExtra() >= 0 ? "On plan" : "Needs adjustment";
    $("#chrisDisc").textContent = money(state.discretionary.currentEach);
    $("#jenDisc").textContent = money(state.discretionary.currentEach);

    $("#planPay").textContent = money(incomeUsed());
    $("#planExpenses").textContent = money(baseExpenses());
    $("#planDisc").textContent = money(state.discretionary.currentEach * 2);

    $("#previousSpend").textContent = money(state.review.previousSpend);
    $("#reviewPaycheck").textContent = money(incomeUsed());
    $("#reviewExtra").textContent = money(availableExtra());
    $("#reviewTitle").textContent = fmtDate(state.paycheck.date).replace(", 2026","") + " paycheck review";
    $("#reviewNarrative").textContent = state.review.narrative;
    $("#homeReviewCopy").textContent = state.review.generated
      ? state.review.narrative
      : "Enter the paycheck to create this period's review.";

    const unread = state.review.unread ? "1" : "";
    $("#reviewBadge").textContent = unread;
    $("#reviewBadge").style.display = unread ? "grid" : "none";
    $("#navBubble").textContent = unread;
    $("#navBubble").style.display = unread ? "grid" : "none";

    $("#proposalAmount").value = state.discretionary.proposalEach;
    renderProposal();
    renderExpenses();
    renderUpcoming();
  }

  function renderExpenses() {
    $("#expenseList").innerHTML = state.expenses.map(item => `
      <div class="expense-row">
        <div class="list-left">
          <div class="cat-icon">${icon(item.category)}</div>
          <div>
            <strong>${escapeHtml(item.name)}</strong>
            <small>${escapeHtml(item.due)} • ${escapeHtml(item.category)}${item.recurring ? " • recurring" : ""}</small>
          </div>
        </div>
        <div style="text-align:right">
          <div class="row-amount">${money2(item.amount)}</div>
          <button data-edit-expense="${item.id}">Edit</button>
        </div>
      </div>
    `).join("");
  }

  function renderUpcoming() {
    $("#upcomingMini").innerHTML = state.expenses.slice(0, 4).map(item => `
      <div class="list-row">
        <div class="list-left">
          <div class="cat-icon">${icon(item.category)}</div>
          <div><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.due)}</small></div>
        </div>
        <div class="row-amount">${money2(item.amount)}</div>
      </div>
    `).join("");
  }

  function renderProposal() {
    const each = Number(state.discretionary.proposalEach || 0);
    const extra = availableExtra(each);
    $("#proposalExtra").textContent = money(extra);

    if (each === state.discretionary.currentEach) {
      $("#proposalReason").textContent = extra >= 0
        ? `The current ${money(each)} each fits this paycheck. You can still change the proposal if you both want to.`
        : `At ${money(each)} each, this paycheck is short by ${money(Math.abs(extra))}. A lower allowance is recommended.`;
    } else {
      const delta = each - state.discretionary.currentEach;
      $("#proposalReason").textContent = delta < 0
        ? `This proposal frees ${money(Math.abs(delta) * 2)} for the household plan this period.`
        : `This proposal uses ${money(delta * 2)} more of the available extra this period.`;
    }

    ["chris","jen"].forEach(person => {
      const approved = !!state.discretionary.approvals[person];
      const btn = document.querySelector(`[data-approver="${person}"]`);
      btn.classList.toggle("approved", approved);
      $(`#${person}Approval`).textContent = approved ? "Approved ✓" : "Approve";
    });

    const both = state.discretionary.approvals.chris && state.discretionary.approvals.jen;
    const changed = each !== state.discretionary.currentEach;
    $("#applyProposal").disabled = !(both && changed);
    $("#applyProposal").textContent = changed
      ? (both ? `Apply ${money(each)} each` : "Waiting for both approvals")
      : "No change proposed";
  }

  function generateReview() {
    const income = incomeUsed();
    const base = baseExpenses();
    const currentEach = state.discretionary.currentEach;
    const currentExtra = income - base - currentEach * 2;

    let suggested = currentEach;
    let narrative;

    if (currentExtra < 0) {
      const baseExtra = income - base;
      const affordablePerPerson = Math.max(0, Math.floor((baseExtra / 2) / 25) * 25);
      suggested = Math.min(currentEach, affordablePerPerson);
      narrative = baseExtra < 0
        ? `This paycheck is ${money(Math.abs(currentExtra))} short with the current discretionary allowance. Even reducing Chris and Jen to $0 each would still leave the core plan ${money(Math.abs(baseExtra))} short, so at least one other planned expense also needs to move, shrink, or be deferred.`
        : `This paycheck is ${money(Math.abs(currentExtra))} short if Chris and Jen each keep ${money(currentEach)} discretionary spending. The suggested allowance is ${money(suggested)} each, which brings the household plan back within this paycheck.`;
    } else if (currentExtra < 250) {
      narrative = `The plan technically fits, but only ${money(currentExtra)} remains after bills and ${money(currentEach)} each in discretionary spending. Keeping the allowance is possible, but lowering it would create a safer cushion.`;
      suggested = Math.max(0, currentEach - 50);
    } else {
      narrative = `After planned expenses and ${money(currentEach)} each for Chris and Jen, this paycheck leaves ${money(currentExtra)} available. The current discretionary amount fits, so no reduction is necessary unless you both prefer to direct more toward reserve or debt.`;
    }

    state.discretionary.proposalEach = suggested;
    state.discretionary.approvals = { chris: false, jen: false };
    state.review.generated = true;
    state.review.unread = true;
    state.review.narrative = narrative;
    save();
  }

  function go(view) {
    $$(".view").forEach(v => v.classList.toggle("active", v.dataset.view === view));
    $$(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.go === view));
    if (view === "reviews") {
      state.review.unread = false;
      save();
      render();
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function setAddMode(mode) {
    $$(".segment").forEach(b => b.classList.toggle("active", b.dataset.addmode === mode));
    $$(".add-panel").forEach(p => p.classList.toggle("active", p.dataset.panel === mode));
  }

  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast.t);
    toast.t = setTimeout(() => el.classList.remove("show"), 2200);
  }

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
  }

  document.addEventListener("click", (e) => {
    const goBtn = e.target.closest("[data-go]");
    if (goBtn) {
      const target = goBtn.dataset.go;
      go(target);
      if (target === "add" && goBtn.dataset.mode) setAddMode(goBtn.dataset.mode);
      return;
    }

    const seg = e.target.closest("[data-addmode]");
    if (seg) {
      setAddMode(seg.dataset.addmode);
      return;
    }

    const edit = e.target.closest("[data-edit-expense]");
    if (edit) {
      const item = state.expenses.find(x => x.id === Number(edit.dataset.editExpense));
      if (!item) return;
      const next = prompt(`Update planned amount for ${item.name}`, Number(item.amount).toFixed(2));
      if (next === null) return;
      const amount = Number(next);
      if (!Number.isFinite(amount) || amount < 0) return toast("Enter a valid amount.");
      item.amount = amount;
      save();
      render();
      toast("Planned cost updated.");
      return;
    }

    const approve = e.target.closest("[data-approver]");
    if (approve) {
      const who = approve.dataset.approver;
      state.discretionary.approvals[who] = !state.discretionary.approvals[who];
      save();
      renderProposal();
    }
  });

  $("#proposalAmount").addEventListener("input", (e) => {
    state.discretionary.proposalEach = Math.max(0, Number(e.target.value || 0));
    state.discretionary.approvals = { chris: false, jen: false };
    save();
    renderProposal();
  });

  $("#applyProposal").addEventListener("click", () => {
    if (!(state.discretionary.approvals.chris && state.discretionary.approvals.jen)) return;
    state.discretionary.currentEach = Number(state.discretionary.proposalEach || 0);
    state.discretionary.approvals = { chris: false, jen: false };
    state.review.narrative = `Chris and Jen both approved ${money(state.discretionary.currentEach)} each for discretionary spending this pay period. The budget has been updated for the prototype.`;
    save();
    render();
    toast("Joint discretionary change applied.");
  });

  $("#expenseForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const amount = Number(fd.get("amount"));
    if (!Number.isFinite(amount) || amount <= 0) return toast("Enter a valid amount.");
    state.expenses.unshift({
      id: Date.now(),
      name: fd.get("name"),
      amount,
      due: fd.get("date") || "This period",
      category: fd.get("category") || "Other",
      recurring: false
    });
    save();
    e.currentTarget.reset();
    render();
    toast("Expense added.");
    go("home");
  });

  $("#recurringForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const amount = Number(fd.get("amount"));
    if (!Number.isFinite(amount) || amount <= 0) return toast("Enter a valid amount.");
    state.expenses.unshift({
      id: Date.now(),
      name: fd.get("name"),
      amount,
      due: fd.get("date") || "Upcoming",
      category: fd.get("category") || "Other",
      recurring: true,
      frequency: fd.get("frequency")
    });
    save();
    e.currentTarget.reset();
    render();
    toast("Recurring bill added.");
    go("plan");
  });

  $("#paycheckForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const amount = Number(fd.get("amount"));
    if (!Number.isFinite(amount) || amount <= 0) return toast("Enter a valid paycheck amount.");
    state.paycheck.actual = amount;
    state.paycheck.date = fd.get("date") || state.paycheck.date;
    state.paycheck.checkingBefore = Number(fd.get("checking") || 0);
    generateReview();
    save();
    render();
    toast("Paycheck saved. Review created.");
    go("reviews");
  });

  const today = new Date();
  const iso = today.toISOString().slice(0,10);
  $$("#expenseForm input[type=date], #recurringForm input[type=date]").forEach(x => { if (!x.value) x.value = iso; });
  $("#paycheckForm input[name=date]").value = state.paycheck.date;

  render();
})();