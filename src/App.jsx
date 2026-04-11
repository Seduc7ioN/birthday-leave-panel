import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import bg from "./assets/bg.png.png";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  { auth: { persistSession: true, autoRefreshToken: true } }
);

const BDAY_TABS = [
  { key: "today", label: "Bugün" },
  { key: "thisWeek", label: "Bu Hafta" },
  { key: "nextWeek", label: "Gelecek Hafta" },
  { key: "thisMonth", label: "Bu Ay" },
  { key: "nextMonth", label: "Gelecek Ay" },
  { key: "upcoming", label: "Yaklaşanlar" },
];

const EMPTY_EMP_FORM = { full_name: "", birth_date: "", phone: "" };
const EMPTY_LEAVE_FORM = {
  employee_id: "",
  leave_type: "Tam Gün İzin",
  start_date: "",
  end_date: "",
  note: "",
  status: "Bekliyor",
};

export default function App() {
  const [session, setSession] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saveMessage, setSaveMessage] = useState("");
  const [birthdayTab, setBirthdayTab] = useState("today");
  const [showLoginModal, setShowLoginModal] = useState(false);

  // Employee management
  const [showEmployeeModal, setShowEmployeeModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [empForm, setEmpForm] = useState(EMPTY_EMP_FORM);

  // Leave edit
  const [editingLeave, setEditingLeave] = useState(null);
  const [leaveEditForm, setLeaveEditForm] = useState(EMPTY_LEAVE_FORM);

  // Toast notifications
  const [toasts, setToasts] = useState([]);

  const [authForm, setAuthForm] = useState({ email: "", password: "", full_name: "" });
  const [form, setForm] = useState(EMPTY_LEAVE_FORM);

  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const birthdaySectionRef = useRef(null);
  const leaveSectionRef = useRef(null);
  const employeeSectionRef = useRef(null);

  function addToast(message, type = "success") {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  }

  useEffect(() => {
    injectGlobalStyles();

    // Supabase v2: onAuthStateChange fires INITIAL_SESSION on page load,
    // so getSession() is not needed and causes double loadAll() calls.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession || null);
      if (currentSession) {
        setShowLoginModal(false);
        loadAll(); // async değil — fire and forget
      } else {
        setEmployees([]);
        setLeaveRequests([]);
        setLoading(false);
        setShowLoginModal(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function loadAll() {
    setLoading(true);
    const [
      { data: employeeData, error: employeeError },
      { data: leaveData, error: leaveError },
    ] = await Promise.all([
      supabase.from("employees").select("*").order("full_name", { ascending: true }),
      supabase
        .from("leave_requests")
        .select("*, employees(full_name)")
        .order("start_date", { ascending: false }),
    ]);

    if (employeeError) console.error("Employees error:", employeeError.message);
    if (leaveError) console.error("Leave requests error:", leaveError.message);

    setEmployees(employeeData || []);
    setLeaveRequests(leaveData || []);
    setLoading(false);
  }

  // --- Auth ---
  async function signIn() {
    const { email, password } = authForm;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { addToast(error.message, "error"); return; }
    setShowLoginModal(false);
  }

  async function signUp() {
    const { email, password, full_name } = authForm;
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name } },
    });
    if (error) { addToast(error.message, "error"); return; }
    addToast("Kayıt tamam. Mail doğrulama açıksa mailini kontrol et.", "info");
  }

  async function signOut() {
    await supabase.auth.signOut(); // hata olsa bile state sıfırla
    setSession(null);
    setEmployees([]);
    setLeaveRequests([]);
    setLoading(false);
    setShowLoginModal(true);
  }

  // --- Employee CRUD ---
  function openAddEmployee() {
    setEditingEmployee(null);
    setEmpForm(EMPTY_EMP_FORM);
    setShowEmployeeModal(true);
  }

  function openEditEmployee(emp) {
    setEditingEmployee(emp);
    setEmpForm({
      full_name: emp.full_name || "",
      birth_date: emp.birth_date || "",
      phone: emp.phone || "",
    });
    setShowEmployeeModal(true);
  }

  async function handleEmployeeSubmit() {
    if (!empForm.full_name.trim()) {
      addToast("Ad Soyad zorunlu.", "error");
      return;
    }

    const payload = {
      full_name: empForm.full_name.trim(),
      birth_date: empForm.birth_date || null,
      phone: empForm.phone.trim() || null,
    };

    if (editingEmployee) {
      const { error } = await supabase
        .from("employees")
        .update(payload)
        .eq("id", editingEmployee.id);
      if (error) { addToast("Güncelleme hatası: " + error.message, "error"); return; }
      addToast("Personel güncellendi.", "success");
    } else {
      const { error } = await supabase.from("employees").insert(payload);
      if (error) { addToast("Kayıt hatası: " + error.message, "error"); return; }
      addToast("Personel eklendi.", "success");
    }

    setShowEmployeeModal(false);
    await loadAll();
  }

  async function deleteEmployee(id) {
    if (!window.confirm("Bu personel silinsin mi?")) return;
    const { error } = await supabase.from("employees").delete().eq("id", id);
    if (error) { addToast("Silme hatası: " + error.message, "error"); return; }
    addToast("Personel silindi.", "success");
    await loadAll();
  }

  // --- Leave CRUD ---
  function handleAuthChange(e) {
    const { name, value } = e.target;
    setAuthForm((prev) => ({ ...prev, [name]: value }));
  }

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaveMessage("");

    if (!session) {
      setSaveMessage("Önce giriş yapmalısın.");
      setShowLoginModal(true);
      return;
    }

    if (!form.employee_id || !form.start_date || !form.end_date) {
      setSaveMessage("Personel, başlangıç ve bitiş tarihi zorunlu.");
      return;
    }

    const { error } = await supabase.from("leave_requests").insert({
      employee_id: form.employee_id,
      leave_type: form.leave_type,
      start_date: form.start_date,
      end_date: form.end_date,
      note: form.note || null,
      status: form.status,
    });

    if (error) { setSaveMessage("Kayıt hatası: " + error.message); return; }

    setSaveMessage("İzin kaydı eklendi.");
    setForm(EMPTY_LEAVE_FORM);
    await loadAll();
    setStatusFilter("");
    scrollToRef(leaveSectionRef);
  }

  async function updateStatus(id, newStatus) {
    if (!session) return;
    const { error } = await supabase
      .from("leave_requests")
      .update({ status: newStatus })
      .eq("id", id);
    if (error) { addToast(error.message, "error"); return; }
    await loadAll();
  }

  async function deleteLeave(id) {
    if (!session) return;
    if (!window.confirm("Bu kayıt silinsin mi?")) return;
    const { error } = await supabase.from("leave_requests").delete().eq("id", id);
    if (error) { addToast(error.message, "error"); return; }
    await loadAll();
  }

  function openEditLeave(leave) {
    setEditingLeave(leave);
    setLeaveEditForm({
      employee_id: leave.employee_id || "",
      leave_type: leave.leave_type || "Tam Gün İzin",
      start_date: leave.start_date || "",
      end_date: leave.end_date || "",
      note: leave.note || "",
      status: leave.status || "Bekliyor",
    });
  }

  async function handleLeaveEdit() {
    if (!leaveEditForm.employee_id || !leaveEditForm.start_date || !leaveEditForm.end_date) {
      addToast("Personel, başlangıç ve bitiş tarihi zorunlu.", "error");
      return;
    }

    const { error } = await supabase
      .from("leave_requests")
      .update({
        employee_id: leaveEditForm.employee_id,
        leave_type: leaveEditForm.leave_type,
        start_date: leaveEditForm.start_date,
        end_date: leaveEditForm.end_date,
        note: leaveEditForm.note || null,
        status: leaveEditForm.status,
      })
      .eq("id", editingLeave.id);

    if (error) { addToast("Güncelleme hatası: " + error.message, "error"); return; }

    addToast("İzin kaydı güncellendi.", "success");
    setEditingLeave(null);
    await loadAll();
  }

  function scrollToRef(ref) {
    ref?.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function openBirthdayTab(tabKey) {
    setBirthdayTab(tabKey);
    setTimeout(() => scrollToRef(birthdaySectionRef), 50);
  }

  function openLeaveSectionWithFilter(status = "", type = "") {
    setStatusFilter(status);
    setTypeFilter(type);
    setTimeout(() => scrollToRef(leaveSectionRef), 50);
  }

  const birthdayStats = useMemo(() => calculateBirthdayStats(employees), [employees]);

  const pendingCount = useMemo(
    () => leaveRequests.filter((x) => x.status === "Bekliyor").length,
    [leaveRequests]
  );

  const todayOnLeaveCount = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    return leaveRequests.filter(
      (x) =>
        x.status !== "Reddedildi" &&
        x.start_date <= todayStr &&
        x.end_date >= todayStr
    ).length;
  }, [leaveRequests]);

  const filteredLeaveRequests = useMemo(() => {
    return leaveRequests.filter((item) => {
      const person = item.employees?.full_name?.toLowerCase() || "";
      const note = item.note?.toLowerCase() || "";
      const q = searchText.trim().toLowerCase();
      const matchesSearch =
        !q || person.includes(q) || note.includes(q) || item.leave_type?.toLowerCase().includes(q);
      const matchesStatus = !statusFilter || item.status === statusFilter;
      const matchesType = !typeFilter || item.leave_type === typeFilter;
      const matchesFrom = !dateFrom || item.start_date >= dateFrom;
      const matchesTo = !dateTo || item.end_date <= dateTo;
      return matchesSearch && matchesStatus && matchesType && matchesFrom && matchesTo;
    });
  }, [leaveRequests, searchText, statusFilter, typeFilter, dateFrom, dateTo]);

  const activeBirthdayItems = birthdayStats[birthdayTab] || [];
  const activeBirthdayLabel =
    BDAY_TABS.find((tab) => tab.key === birthdayTab)?.label || "Bugün";

  const canManage = !!session;
  const canDelete = !!session;

  return (
    <div style={pageStyle}>
      <div style={overlayStyle} />

      <div style={contentWrapStyle}>
        {/* Birthday Banner */}
        {session && birthdayStats.today.length > 0 && (
          <BirthdayBanner people={birthdayStats.today} />
        )}

        <header style={headerStyle}>
          <div style={headerLeftStyle}>
            <div style={logoBoxStyle}>
              <span style={{ fontSize: 28 }}>🎉</span>
            </div>
            <div>
              <div style={headerTopLineStyle}>Personel Yönetim Paneli</div>
              <h1 style={headerTitleStyle}>Doğum Günü + İzin Takip</h1>
              <div style={headerMetaRowStyle}>
                <span style={metaBadgeStyle}>
                  👤 {session?.user?.email || "Misafir"}
                </span>
                <span style={getRoleBadgeStyle()}>ADMIN</span>
              </div>
            </div>
          </div>

          <div style={headerRightStyle}>
            <div style={headerInfoCardStyle}>
              <div style={headerInfoLabelStyle}>Bugün</div>
              <div style={headerInfoValueStyle}>
                {new Date().toLocaleDateString("tr-TR")}
              </div>
            </div>
            {!session ? (
              <button onClick={() => setShowLoginModal(true)} style={logoutButtonStyle}>
                Giriş
              </button>
            ) : (
              <button onClick={signOut} style={logoutButtonStyle}>
                Çıkış
              </button>
            )}
          </div>
        </header>

        {session && (
          <>
            {/* KPI Grid */}
            <div style={kpiGridStyle}>
              <Card
                title="👥 Personel"
                value={employees.length}
                onClick={() => scrollToRef(employeeSectionRef)}
              />
              <Card
                title="🎂 Bugün"
                value={birthdayStats.today.length}
                onClick={() => openBirthdayTab("today")}
                accent={birthdayStats.today.length > 0 ? "gold" : undefined}
              />
              <Card
                title="📆 Bu Hafta"
                value={birthdayStats.thisWeek.length}
                onClick={() => openBirthdayTab("thisWeek")}
              />
              <Card
                title="⏭️ Gelecek Hafta"
                value={birthdayStats.nextWeek.length}
                onClick={() => openBirthdayTab("nextWeek")}
              />
              <Card
                title="📝 Bekleyen İzin"
                value={pendingCount}
                onClick={() => openLeaveSectionWithFilter("Bekliyor", "")}
                accent={pendingCount > 0 ? "amber" : undefined}
              />
              <Card
                title="🏖️ Bugün İzinli"
                value={todayOnLeaveCount}
                onClick={() => openLeaveSectionWithFilter("", "")}
              />
            </div>

            {/* Employee Section */}
            <div ref={employeeSectionRef}>
              <Section
                title={`👥 Personel Listesi (${employees.length})`}
                action={
                  <button onClick={openAddEmployee} style={buttonStyle}>
                    + Personel Ekle
                  </button>
                }
              >
                {loading ? (
                  <LoadingSkeleton rows={3} />
                ) : employees.length === 0 ? (
                  <p style={{ opacity: 0.6, margin: 0 }}>Henüz personel yok.</p>
                ) : (
                  <>
                    <div className="desktop-table" style={{ overflowX: "auto" }}>
                      <table style={tableStyle}>
                        <thead>
                          <tr>
                            <th style={thStyle}>Ad Soyad</th>
                            <th style={thStyle}>Doğum Tarihi</th>
                            <th style={thStyle}>Telefon</th>
                            <th style={thStyle}>İşlem</th>
                          </tr>
                        </thead>
                        <tbody>
                          {employees.map((emp) => (
                            <tr key={emp.id} className="table-row">
                              <td style={tdStyle}>{emp.full_name}</td>
                              <td style={tdStyle}>
                                {emp.birth_date ? formatDateTR(emp.birth_date) : "-"}
                              </td>
                              <td style={tdStyle}>{emp.phone || "-"}</td>
                              <td style={tdStyle}>
                                <div style={{ display: "flex", gap: 6 }}>
                                  <button
                                    onClick={() => openEditEmployee(emp)}
                                    style={smallButtonStyle}
                                  >
                                    Düzenle
                                  </button>
                                  <button
                                    onClick={() => deleteEmployee(emp.id)}
                                    style={{ ...smallButtonStyle, background: "rgba(127,29,29,0.75)", borderColor: "rgba(248,113,113,0.2)" }}
                                  >
                                    Sil
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="mobile-cards">
                      {employees.map((emp) => (
                        <div key={emp.id} style={mobileLeaveCardStyle}>
                          <div style={{ fontWeight: "bold", marginBottom: 8 }}>{emp.full_name}</div>
                          <div style={mobileRowStyle}>
                            <span style={mobileLabelStyle}>Doğum</span>
                            <span>{emp.birth_date ? formatDateTR(emp.birth_date) : "-"}</span>
                          </div>
                          <div style={mobileRowStyle}>
                            <span style={mobileLabelStyle}>Telefon</span>
                            <span>{emp.phone || "-"}</span>
                          </div>
                          <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                            <button onClick={() => openEditEmployee(emp)} style={smallButtonStyle}>
                              Düzenle
                            </button>
                            <button
                              onClick={() => deleteEmployee(emp.id)}
                              style={{ ...smallButtonStyle, background: "rgba(127,29,29,0.75)" }}
                            >
                              Sil
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </Section>
            </div>

            {/* Birthday Section */}
            <div ref={birthdaySectionRef}>
              <Section
                title={`🎂 Doğum Günü Takibi • ${activeBirthdayLabel} (${activeBirthdayItems.length})`}
              >
                <div style={tabsWrapStyle}>
                  {BDAY_TABS.map((tab) => (
                    <button
                      key={tab.key}
                      onClick={() => setBirthdayTab(tab.key)}
                      style={{
                        ...tabButtonStyle,
                        ...(birthdayTab === tab.key ? activeTabButtonStyle : {}),
                      }}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                <BirthdayList
                  items={activeBirthdayItems}
                  emptyText={`${activeBirthdayLabel} için kayıt yok`}
                  showUpcoming={birthdayTab === "upcoming"}
                />
              </Section>
            </div>

            {/* New Leave Form */}
            <Section title="📝 Yeni İzin Talebi">
              <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
                <select
                  name="employee_id"
                  value={form.employee_id}
                  onChange={handleChange}
                  style={inputStyle}
                >
                  <option value="">Personel seç</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.full_name}
                    </option>
                  ))}
                </select>

                <select
                  name="leave_type"
                  value={form.leave_type}
                  onChange={handleChange}
                  style={inputStyle}
                >
                  <option>Tam Gün İzin</option>
                  <option>Yarım Gün İzin</option>
                  <option>Yıllık İzin</option>
                  <option>Mazeret İzni</option>
                  <option>Rapor</option>
                  <option>Ücretsiz İzin</option>
                </select>

                <div style={dateGridStyle}>
                  <input
                    type="date"
                    name="start_date"
                    value={form.start_date}
                    onChange={handleChange}
                    style={inputStyle}
                  />
                  <input
                    type="date"
                    name="end_date"
                    value={form.end_date}
                    onChange={handleChange}
                    style={inputStyle}
                  />
                </div>

                <select
                  name="status"
                  value={form.status}
                  onChange={handleChange}
                  style={inputStyle}
                >
                  <option>Bekliyor</option>
                  <option>Onaylandı</option>
                  <option>Reddedildi</option>
                </select>

                <textarea
                  name="note"
                  placeholder="Not / açıklama"
                  value={form.note}
                  onChange={handleChange}
                  rows={3}
                  style={{ ...inputStyle, resize: "vertical" }}
                />

                <button type="submit" style={buttonStyle}>
                  İzin Kaydet
                </button>

                {saveMessage && (
                  <p
                    style={{
                      margin: 0,
                      fontSize: 14,
                      color:
                        saveMessage.includes("hatası") ||
                        saveMessage.includes("zorunlu") ||
                        saveMessage.includes("Önce")
                          ? "#fca5a5"
                          : "#86efac",
                    }}
                  >
                    {saveMessage}
                  </p>
                )}
              </form>
            </Section>

            {/* Leave Table */}
            <div ref={leaveSectionRef}>
              <Section title={`📋 İzin Kayıt Tablosu (${filteredLeaveRequests.length})`}>
                <div style={filterBarStyle}>
                  <input
                    placeholder="İsim, not veya izin türü ara..."
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    style={inputStyle}
                  />
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    style={inputStyle}
                  >
                    <option value="">Tüm Durumlar</option>
                    <option value="Bekliyor">Bekliyor</option>
                    <option value="Onaylandı">Onaylandı</option>
                    <option value="Reddedildi">Reddedildi</option>
                  </select>
                  <select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                    style={inputStyle}
                  >
                    <option value="">Tüm Türler</option>
                    <option value="Tam Gün İzin">Tam Gün İzin</option>
                    <option value="Yarım Gün İzin">Yarım Gün İzin</option>
                    <option value="Yıllık İzin">Yıllık İzin</option>
                    <option value="Mazeret İzni">Mazeret İzni</option>
                    <option value="Rapor">Rapor</option>
                    <option value="Ücretsiz İzin">Ücretsiz İzin</option>
                  </select>
                </div>

                <div style={filterBarStyle}>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    style={inputStyle}
                  />
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    style={inputStyle}
                  />
                  <button
                    onClick={() => {
                      setSearchText("");
                      setStatusFilter("");
                      setTypeFilter("");
                      setDateFrom("");
                      setDateTo("");
                    }}
                    style={secondaryButtonStyle}
                  >
                    Filtreleri Temizle
                  </button>
                </div>

                {loading ? (
                  <LoadingSkeleton rows={5} />
                ) : filteredLeaveRequests.length === 0 ? (
                  <p style={{ opacity: 0.6, margin: 0 }}>Kayıt bulunamadı</p>
                ) : (
                  <>
                    <div className="desktop-table" style={{ overflowX: "auto" }}>
                      <table style={tableStyle}>
                        <thead>
                          <tr>
                            <th style={thStyle}>Personel</th>
                            <th style={thStyle}>Tür</th>
                            <th style={thStyle}>Başlangıç</th>
                            <th style={thStyle}>Bitiş</th>
                            <th style={thStyle}>Gün</th>
                            <th style={thStyle}>Durum</th>
                            <th style={thStyle}>Not</th>
                            <th style={thStyle}>İşlem</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredLeaveRequests.map((item) => (
                            <tr key={item.id} className="table-row">
                              <td style={tdStyle}>{item.employees?.full_name || "-"}</td>
                              <td style={tdStyle}>{item.leave_type}</td>
                              <td style={tdStyle}>{formatDateTR(item.start_date)}</td>
                              <td style={tdStyle}>{formatDateTR(item.end_date)}</td>
                              <td style={{ ...tdStyle, fontWeight: 700, color: "#93c5fd" }}>
                                {calcDays(item.start_date, item.end_date)}
                              </td>
                              <td style={tdStyle}>
                                <span style={getStatusBadgeStyle(item.status)}>
                                  {item.status}
                                </span>
                              </td>
                              <td style={tdStyle}>{item.note || "-"}</td>
                              <td style={tdStyle}>
                                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                  {canManage && (
                                    <>
                                      <button
                                        onClick={() => updateStatus(item.id, "Onaylandı")}
                                        style={smallButtonStyle}
                                      >
                                        Onayla
                                      </button>
                                      <button
                                        onClick={() => updateStatus(item.id, "Reddedildi")}
                                        style={smallButtonStyle}
                                      >
                                        Reddet
                                      </button>
                                      <button
                                        onClick={() => updateStatus(item.id, "Bekliyor")}
                                        style={smallButtonStyle}
                                      >
                                        Bekliyor
                                      </button>
                                      <button
                                        onClick={() => openEditLeave(item)}
                                        style={{
                                          ...smallButtonStyle,
                                          background: "rgba(37,99,235,0.45)",
                                          borderColor: "rgba(96,165,250,0.3)",
                                        }}
                                      >
                                        Düzenle
                                      </button>
                                    </>
                                  )}
                                  {canDelete && (
                                    <button
                                      onClick={() => deleteLeave(item.id)}
                                      style={{
                                        ...smallButtonStyle,
                                        background: "rgba(127,29,29,0.75)",
                                        borderColor: "rgba(248,113,113,0.2)",
                                      }}
                                    >
                                      Sil
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="mobile-cards">
                      {filteredLeaveRequests.map((item) => (
                        <div key={item.id} style={mobileLeaveCardStyle}>
                          <div style={{ fontWeight: "bold", marginBottom: 8 }}>
                            {item.employees?.full_name || "-"}
                          </div>
                          <div style={mobileRowStyle}>
                            <span style={mobileLabelStyle}>Tür</span>
                            <span>{item.leave_type}</span>
                          </div>
                          <div style={mobileRowStyle}>
                            <span style={mobileLabelStyle}>Başlangıç</span>
                            <span>{formatDateTR(item.start_date)}</span>
                          </div>
                          <div style={mobileRowStyle}>
                            <span style={mobileLabelStyle}>Bitiş</span>
                            <span>{formatDateTR(item.end_date)}</span>
                          </div>
                          <div style={mobileRowStyle}>
                            <span style={mobileLabelStyle}>Gün</span>
                            <span style={{ fontWeight: 700, color: "#93c5fd" }}>
                              {calcDays(item.start_date, item.end_date)}
                            </span>
                          </div>
                          <div style={mobileRowStyle}>
                            <span style={mobileLabelStyle}>Durum</span>
                            <span style={getStatusBadgeStyle(item.status)}>{item.status}</span>
                          </div>
                          <div style={mobileRowStyle}>
                            <span style={mobileLabelStyle}>Not</span>
                            <span>{item.note || "-"}</span>
                          </div>
                          <div
                            style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}
                          >
                            {canManage && (
                              <>
                                <button
                                  onClick={() => updateStatus(item.id, "Onaylandı")}
                                  style={smallButtonStyle}
                                >
                                  Onayla
                                </button>
                                <button
                                  onClick={() => updateStatus(item.id, "Reddedildi")}
                                  style={smallButtonStyle}
                                >
                                  Reddet
                                </button>
                                <button
                                  onClick={() => openEditLeave(item)}
                                  style={{
                                    ...smallButtonStyle,
                                    background: "rgba(37,99,235,0.45)",
                                  }}
                                >
                                  Düzenle
                                </button>
                              </>
                            )}
                            {canDelete && (
                              <button
                                onClick={() => deleteLeave(item.id)}
                                style={{ ...smallButtonStyle, background: "rgba(127,29,29,0.75)" }}
                              >
                                Sil
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </Section>
            </div>
          </>
        )}

        {!session && (
          <Section title="Bilgi">
            <p style={{ opacity: 0.7, margin: 0 }}>
              Paneli kullanmak için sağ üstten giriş yap.
            </p>
          </Section>
        )}
      </div>

      {/* Login Modal */}
      {showLoginModal && (
        <div style={modalBackdropStyle} onClick={() => setShowLoginModal(false)}>
          <div style={modalCardStyle} onClick={(e) => e.stopPropagation()}>
            <div style={{ marginBottom: 20 }}>
              <div style={headerTopLineStyle}>Oturum Aç</div>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Giriş / Kayıt</h2>
            </div>
            <div style={{ display: "grid", gap: 12 }}>
              <input
                name="full_name"
                placeholder="Ad Soyad"
                value={authForm.full_name}
                onChange={handleAuthChange}
                style={inputStyle}
              />
              <input
                name="email"
                placeholder="E-posta"
                value={authForm.email}
                onChange={handleAuthChange}
                style={inputStyle}
              />
              <input
                name="password"
                type="password"
                placeholder="Şifre"
                value={authForm.password}
                onChange={handleAuthChange}
                style={inputStyle}
              />
              <button onClick={signIn} style={buttonStyle}>
                Giriş Yap
              </button>
              <button onClick={signUp} style={secondaryButtonStyle}>
                Kayıt Ol
              </button>
              <button onClick={() => setShowLoginModal(false)} style={secondaryButtonStyle}>
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Employee Modal */}
      {showEmployeeModal && (
        <div style={modalBackdropStyle} onClick={() => setShowEmployeeModal(false)}>
          <div style={modalCardStyle} onClick={(e) => e.stopPropagation()}>
            <div style={{ marginBottom: 20 }}>
              <div style={headerTopLineStyle}>
                {editingEmployee ? "Personel Düzenle" : "Yeni Personel"}
              </div>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>
                {editingEmployee ? "Bilgileri Güncelle" : "Personel Ekle"}
              </h2>
            </div>
            <div style={{ display: "grid", gap: 12 }}>
              <input
                placeholder="Ad Soyad *"
                value={empForm.full_name}
                onChange={(e) => setEmpForm((p) => ({ ...p, full_name: e.target.value }))}
                style={inputStyle}
              />
              <div>
                <div style={inputLabelStyle}>Doğum Tarihi</div>
                <input
                  type="date"
                  value={empForm.birth_date}
                  onChange={(e) => setEmpForm((p) => ({ ...p, birth_date: e.target.value }))}
                  style={inputStyle}
                />
              </div>
              <input
                placeholder="Telefon (5xx xxx xx xx)"
                value={empForm.phone}
                onChange={(e) => setEmpForm((p) => ({ ...p, phone: e.target.value }))}
                style={inputStyle}
              />
              <button onClick={handleEmployeeSubmit} style={buttonStyle}>
                {editingEmployee ? "Güncelle" : "Ekle"}
              </button>
              <button onClick={() => setShowEmployeeModal(false)} style={secondaryButtonStyle}>
                İptal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Leave Edit Modal */}
      {editingLeave && (
        <div style={modalBackdropStyle} onClick={() => setEditingLeave(null)}>
          <div style={modalCardStyle} onClick={(e) => e.stopPropagation()}>
            <div style={{ marginBottom: 20 }}>
              <div style={headerTopLineStyle}>İzin Düzenle</div>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>
                İzin Kaydını Güncelle
              </h2>
            </div>
            <div style={{ display: "grid", gap: 12 }}>
              <select
                value={leaveEditForm.employee_id}
                onChange={(e) =>
                  setLeaveEditForm((p) => ({ ...p, employee_id: e.target.value }))
                }
                style={inputStyle}
              >
                <option value="">Personel seç</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.full_name}
                  </option>
                ))}
              </select>
              <select
                value={leaveEditForm.leave_type}
                onChange={(e) =>
                  setLeaveEditForm((p) => ({ ...p, leave_type: e.target.value }))
                }
                style={inputStyle}
              >
                <option>Tam Gün İzin</option>
                <option>Yarım Gün İzin</option>
                <option>Yıllık İzin</option>
                <option>Mazeret İzni</option>
                <option>Rapor</option>
                <option>Ücretsiz İzin</option>
              </select>
              <div style={dateGridStyle}>
                <input
                  type="date"
                  value={leaveEditForm.start_date}
                  onChange={(e) =>
                    setLeaveEditForm((p) => ({ ...p, start_date: e.target.value }))
                  }
                  style={inputStyle}
                />
                <input
                  type="date"
                  value={leaveEditForm.end_date}
                  onChange={(e) =>
                    setLeaveEditForm((p) => ({ ...p, end_date: e.target.value }))
                  }
                  style={inputStyle}
                />
              </div>
              <select
                value={leaveEditForm.status}
                onChange={(e) =>
                  setLeaveEditForm((p) => ({ ...p, status: e.target.value }))
                }
                style={inputStyle}
              >
                <option>Bekliyor</option>
                <option>Onaylandı</option>
                <option>Reddedildi</option>
              </select>
              <textarea
                placeholder="Not / açıklama"
                value={leaveEditForm.note}
                onChange={(e) =>
                  setLeaveEditForm((p) => ({ ...p, note: e.target.value }))
                }
                rows={3}
                style={{ ...inputStyle, resize: "vertical" }}
              />
              <button onClick={handleLeaveEdit} style={buttonStyle}>
                Güncelle
              </button>
              <button onClick={() => setEditingLeave(null)} style={secondaryButtonStyle}>
                İptal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notifications */}
      <div style={toastContainerStyle}>
        {toasts.map((toast) => (
          <div key={toast.id} style={getToastStyle(toast.type)}>
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Components ────────────────────────────────────────────────

function BirthdayBanner({ people }) {
  const names = people.map((p) => p.full_name).join(", ");
  return (
    <div style={birthdayBannerStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <span style={{ fontSize: 32, flexShrink: 0 }}>🎂</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 3 }}>
            Bugün {people.length} personelin doğum günü!
          </div>
          <div style={{ fontSize: 14, opacity: 0.88 }}>{names}</div>
        </div>
        <span style={{ fontSize: 32, flexShrink: 0 }}>🎉</span>
      </div>
    </div>
  );
}

function BirthdayList({ items, emptyText, showUpcoming = false }) {
  if (!items.length) return <p style={{ opacity: 0.6, margin: 0 }}>{emptyText}</p>;

  return (
    <div style={birthdayGridStyle}>
      {items.map((item) => (
        <div key={item.id} style={birthdayCardStyle}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
            {item.full_name}
          </div>
          <div style={{ fontSize: 13, opacity: 0.72, marginBottom: 10 }}>
            {showUpcoming
              ? `${formatBirthday(item.birth_date)} • ${item.daysLeft} gün kaldı`
              : formatBirthday(item.birth_date)}
          </div>
          <button
            onClick={() => openBirthdayWhatsApp(item)}
            disabled={!item.phone}
            style={{
              ...smallButtonStyle,
              background: item.phone ? "rgba(21,128,61,0.7)" : "rgba(75,85,99,0.5)",
              borderColor: item.phone ? "rgba(34,197,94,0.25)" : "transparent",
              cursor: item.phone ? "pointer" : "not-allowed",
              opacity: item.phone ? 1 : 0.6,
              fontSize: 13,
            }}
          >
            {item.phone ? "WhatsApp" : "Numara Yok"}
          </button>
        </div>
      ))}
    </div>
  );
}

function LoadingSkeleton({ rows = 3 }) {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="skeleton"
          style={{ height: 44, borderRadius: 12, background: "rgba(255,255,255,0.05)" }}
        />
      ))}
    </div>
  );
}

function Card({ title, value, onClick, accent }) {
  const accentMap = {
    gold: { shadow: "rgba(251,191,36,0.2)", border: "rgba(251,191,36,0.32)" },
    amber: { shadow: "rgba(245,158,11,0.2)", border: "rgba(245,158,11,0.32)" },
  };
  const a = accentMap[accent];

  return (
    <div
      onClick={onClick}
      className="kpi-card"
      style={{
        ...cardStyle,
        cursor: onClick ? "pointer" : "default",
        boxShadow: a ? `0 14px 34px ${a.shadow}` : cardStyle.boxShadow,
        border: a ? `1px solid ${a.border}` : cardStyle.border,
      }}
    >
      <div style={{ fontSize: 13, opacity: 0.82, letterSpacing: 0.3, fontWeight: 600 }}>
        {title}
      </div>
      <div
        style={{
          fontSize: 38,
          fontWeight: 900,
          marginTop: 10,
          letterSpacing: -1.5,
          color: accent === "gold" ? "#fde68a" : accent === "amber" ? "#fcd34d" : "#fff",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function Section({ title, children, action }) {
  return (
    <div style={sectionStyle}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, letterSpacing: 0.2 }}>{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────

function calcDays(start, end) {
  if (!start || !end) return "-";
  const diff = Math.floor((new Date(end) - new Date(start)) / (1000 * 60 * 60 * 24)) + 1;
  return diff > 0 ? `${diff}g` : "-";
}

function calculateBirthdayStats(employees) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const currentMonth = today.getMonth();
  const nextMonth = (currentMonth + 1) % 12;

  const result = {
    today: [],
    thisWeek: [],
    nextWeek: [],
    thisMonth: [],
    nextMonth: [],
    upcoming: [],
  };

  employees.forEach((employee) => {
    if (!employee.birth_date) return;

    const birthDate = new Date(employee.birth_date);
    if (Number.isNaN(birthDate.getTime())) return;

    const birthMonth = birthDate.getMonth();
    const birthDay = birthDate.getDate();

    const nextBirthday = new Date(today.getFullYear(), birthMonth, birthDay);
    nextBirthday.setHours(0, 0, 0, 0);

    if (nextBirthday < today) {
      nextBirthday.setFullYear(today.getFullYear() + 1);
    }

    const daysLeft = Math.floor((nextBirthday - today) / (1000 * 60 * 60 * 24));
    const item = { ...employee, daysLeft };

    if (birthMonth === currentMonth) result.thisMonth.push(item);
    if (birthMonth === nextMonth) result.nextMonth.push(item);
    if (daysLeft === 0) result.today.push(item);
    if (daysLeft >= 0 && daysLeft <= 6) result.thisWeek.push(item);
    if (daysLeft >= 7 && daysLeft <= 13) result.nextWeek.push(item);
    if (daysLeft >= 0 && daysLeft <= 30) result.upcoming.push(item);
  });

  result.today.sort((a, b) => a.daysLeft - b.daysLeft);
  result.thisWeek.sort((a, b) => a.daysLeft - b.daysLeft);
  result.nextWeek.sort((a, b) => a.daysLeft - b.daysLeft);
  result.thisMonth.sort(
    (a, b) => new Date(a.birth_date).getDate() - new Date(b.birth_date).getDate()
  );
  result.nextMonth.sort(
    (a, b) => new Date(a.birth_date).getDate() - new Date(b.birth_date).getDate()
  );
  result.upcoming.sort((a, b) => a.daysLeft - b.daysLeft);

  return result;
}

function formatBirthday(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("tr-TR", { day: "2-digit", month: "long" });
}

function formatDateTR(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("tr-TR");
}

function openBirthdayWhatsApp(person) {
  const rawPhone = person?.phone || "";
  let phone = String(rawPhone).replace(/\D/g, "");

  if (!phone) {
    return;
  }

  if (phone.startsWith("0")) phone = phone.slice(1);
  if (!phone.startsWith("90")) phone = `90${phone}`;

  const text = `İyi ki doğdun ${person.full_name}! Sağlık, mutluluk ve başarı dolu nice güzel yaşların olsun 🎉🎂`;
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank");
}

// ─── Global Styles ───────────────────────────────────────────

function injectGlobalStyles() {
  if (typeof document === "undefined") return;

  if (!document.getElementById("inter-font")) {
    const link = document.createElement("link");
    link.id = "inter-font";
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap";
    document.head.appendChild(link);
  }

  if (document.getElementById("custom-app-style")) return;

  const style = document.createElement("style");
  style.id = "custom-app-style";
  style.innerHTML = `
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(14px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes slideInRight {
      from { opacity: 0; transform: translateX(48px); }
      to   { opacity: 1; transform: translateX(0); }
    }
    @keyframes bdayPulse {
      0%, 100% { box-shadow: 0 8px 32px rgba(234,179,8,0.18), inset 0 1px 0 rgba(255,255,255,0.08); }
      50%       { box-shadow: 0 12px 44px rgba(234,179,8,0.32), inset 0 1px 0 rgba(255,255,255,0.10); }
    }
    @keyframes skeletonShimmer {
      0%   { opacity: 0.4; }
      50%  { opacity: 0.8; }
      100% { opacity: 0.4; }
    }

    body {
      margin: 0;
      background: #05070d;
      font-family: 'Inter', Arial, sans-serif;
    }

    * { box-sizing: border-box; }

    button {
      font-family: 'Inter', Arial, sans-serif;
      transition: transform 0.18s ease, filter 0.18s ease, box-shadow 0.18s ease;
    }
    button:hover  { transform: translateY(-2px); filter: brightness(1.1); }
    button:active { transform: translateY(0) scale(0.97); filter: brightness(0.96); }

    input, select, textarea {
      font-family: 'Inter', Arial, sans-serif;
      transition: border-color 0.2s ease, box-shadow 0.2s ease;
    }
    input:focus, select:focus, textarea:focus {
      outline: none;
      border-color: rgba(96,165,250,0.5) !important;
      box-shadow: 0 0 0 3px rgba(59,130,246,0.14) !important;
    }
    input::placeholder, textarea::placeholder { color: rgba(255,255,255,0.36); }

    .kpi-card {
      transition: transform 0.22s ease, box-shadow 0.22s ease !important;
    }
    .kpi-card:hover {
      transform: translateY(-5px) !important;
      box-shadow: 0 24px 56px rgba(0,0,0,0.38) !important;
    }

    .table-row { transition: background 0.15s ease; }
    .table-row:hover td { background: rgba(255,255,255,0.028); }

    .skeleton { animation: skeletonShimmer 1.6s ease infinite; }

    .mobile-cards { display: none; }

    @media (max-width: 768px) {
      .desktop-table { display: none; }
      .mobile-cards  { display: block; }
    }
  `;
  document.head.appendChild(style);
}

// ─── Style Objects ───────────────────────────────────────────

const pageStyle = {
  minHeight: "100vh",
  padding: 24,
  fontFamily: "'Inter', Arial, sans-serif",
  color: "white",
  backgroundImage: `url(${bg})`,
  backgroundSize: "cover",
  backgroundPosition: "center",
  backgroundRepeat: "no-repeat",
  backgroundAttachment: "fixed",
  position: "relative",
  overflow: "hidden",
};

const overlayStyle = {
  position: "absolute",
  inset: 0,
  background:
    "linear-gradient(135deg, rgba(3,7,18,0.84) 0%, rgba(10,15,28,0.76) 35%, rgba(17,24,39,0.72) 65%, rgba(2,6,23,0.84) 100%)",
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)",
  zIndex: 0,
};

const contentWrapStyle = {
  position: "relative",
  zIndex: 1,
  animation: "fadeIn 0.5s ease",
};

const kpiGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  gap: 14,
  marginBottom: 22,
};

const dateGridStyle = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 12,
};

const filterBarStyle = {
  display: "grid",
  gridTemplateColumns: "2fr 1fr 1fr",
  gap: 12,
  marginBottom: 14,
};

const tabsWrapStyle = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  marginBottom: 18,
};

const tabButtonStyle = {
  padding: "9px 14px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.09)",
  background: "rgba(55,65,81,0.5)",
  color: "white",
  cursor: "pointer",
  fontWeight: 600,
  fontSize: 13,
};

const activeTabButtonStyle = {
  background: "linear-gradient(135deg, #1d4ed8, #3b82f6)",
  border: "1px solid rgba(96,165,250,0.35)",
  boxShadow: "0 4px 16px rgba(59,130,246,0.28)",
};

const cardStyle = {
  background: "rgba(17, 25, 40, 0.52)",
  padding: "18px 20px",
  borderRadius: 20,
  border: "1px solid rgba(255,255,255,0.09)",
  backdropFilter: "blur(14px)",
  WebkitBackdropFilter: "blur(14px)",
  boxShadow: "0 14px 34px rgba(0,0,0,0.24)",
};

const sectionStyle = {
  background: "rgba(17, 25, 40, 0.52)",
  padding: "24px 26px",
  borderRadius: 22,
  marginBottom: 20,
  border: "1px solid rgba(255,255,255,0.08)",
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  boxShadow: "0 16px 40px rgba(0,0,0,0.26), inset 0 1px 0 rgba(255,255,255,0.05)",
};

const inputStyle = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(8,12,22,0.80)",
  color: "white",
  fontSize: 14,
  boxSizing: "border-box",
  outline: "none",
};

const inputLabelStyle = {
  fontSize: 12,
  color: "rgba(255,255,255,0.55)",
  marginBottom: 6,
  fontWeight: 600,
  letterSpacing: 0.4,
  textTransform: "uppercase",
};

const buttonStyle = {
  padding: "12px 18px",
  border: "none",
  borderRadius: 12,
  background: "linear-gradient(135deg, #1d4ed8, #3b82f6)",
  color: "white",
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
  boxShadow: "0 8px 22px rgba(37,99,235,0.38)",
};

const secondaryButtonStyle = {
  padding: "11px 16px",
  border: "1px solid rgba(255,255,255,0.10)",
  borderRadius: 12,
  background: "rgba(51,65,85,0.75)",
  color: "white",
  fontWeight: 600,
  fontSize: 14,
  cursor: "pointer",
};

const smallButtonStyle = {
  padding: "7px 12px",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 9,
  background: "rgba(55,65,81,0.82)",
  color: "white",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 500,
};

const birthdayBannerStyle = {
  marginBottom: 20,
  borderRadius: 18,
  background:
    "linear-gradient(135deg, rgba(120,53,15,0.35) 0%, rgba(234,179,8,0.18) 50%, rgba(120,53,15,0.35) 100%)",
  border: "1px solid rgba(234,179,8,0.38)",
  padding: "18px 24px",
  animation: "bdayPulse 3.5s ease infinite",
};

const birthdayGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
  gap: 12,
};

const birthdayCardStyle = {
  padding: "16px 18px",
  borderRadius: 16,
  background: "rgba(10,14,26,0.62)",
  border: "1px solid rgba(255,255,255,0.08)",
  backdropFilter: "blur(10px)",
};

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: 860,
};

const thStyle = {
  textAlign: "left",
  padding: "10px 12px",
  borderBottom: "1px solid rgba(255,255,255,0.08)",
  color: "rgba(255,255,255,0.55)",
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: 0.6,
  textTransform: "uppercase",
};

const tdStyle = {
  padding: "11px 12px",
  borderBottom: "1px solid rgba(255,255,255,0.05)",
  verticalAlign: "middle",
  fontSize: 14,
};

const mobileLeaveCardStyle = {
  padding: "16px",
  borderRadius: 16,
  marginBottom: 12,
  background: "rgba(10,14,24,0.70)",
  border: "1px solid rgba(255,255,255,0.07)",
};

const mobileRowStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  marginBottom: 8,
  alignItems: "center",
};

const mobileLabelStyle = {
  color: "rgba(255,255,255,0.55)",
  fontSize: 12,
  fontWeight: 600,
  minWidth: 72,
  textTransform: "uppercase",
  letterSpacing: 0.3,
};

const headerStyle = {
  position: "relative",
  zIndex: 1,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 16,
  flexWrap: "wrap",
  padding: "22px 26px",
  marginBottom: 22,
  borderRadius: 22,
  background: "rgba(12, 18, 32, 0.60)",
  border: "1px solid rgba(255,255,255,0.10)",
  boxShadow: "0 16px 44px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.06)",
  backdropFilter: "blur(18px)",
  WebkitBackdropFilter: "blur(18px)",
};

const headerLeftStyle = {
  display: "flex",
  alignItems: "center",
  gap: 16,
  flexWrap: "wrap",
};

const logoBoxStyle = {
  width: 64,
  height: 64,
  borderRadius: 18,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "linear-gradient(135deg, rgba(29,78,216,0.95), rgba(59,130,246,0.70))",
  boxShadow: "0 8px 24px rgba(37,99,235,0.38)",
  flexShrink: 0,
  border: "1px solid rgba(255,255,255,0.12)",
};

const headerTopLineStyle = {
  fontSize: 11,
  letterSpacing: 1.6,
  textTransform: "uppercase",
  color: "rgba(255,255,255,0.55)",
  marginBottom: 5,
  fontWeight: 600,
};

const headerTitleStyle = {
  margin: 0,
  fontSize: 28,
  lineHeight: 1.1,
  fontWeight: 900,
  color: "#fff",
  letterSpacing: -0.5,
  textShadow: "0 2px 12px rgba(0,0,0,0.4)",
};

const headerMetaRowStyle = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  marginTop: 10,
};

const metaBadgeStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 12px",
  borderRadius: 999,
  background: "rgba(255,255,255,0.07)",
  color: "rgba(255,255,255,0.88)",
  fontSize: 12,
  fontWeight: 600,
  border: "1px solid rgba(255,255,255,0.07)",
};

const headerRightStyle = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
};

const headerInfoCardStyle = {
  padding: "10px 16px",
  borderRadius: 14,
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.08)",
  minWidth: 120,
};

const headerInfoLabelStyle = {
  fontSize: 11,
  color: "rgba(255,255,255,0.55)",
  marginBottom: 4,
  fontWeight: 600,
  letterSpacing: 0.5,
  textTransform: "uppercase",
};

const headerInfoValueStyle = {
  fontSize: 15,
  fontWeight: 700,
  color: "#fff",
};

const logoutButtonStyle = {
  padding: "11px 18px",
  border: "1px solid rgba(255,255,255,0.10)",
  borderRadius: 12,
  background: "rgba(30,41,59,0.9)",
  color: "white",
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
  boxShadow: "0 6px 18px rgba(0,0,0,0.24)",
};

const modalBackdropStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.62)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
  zIndex: 50,
  backdropFilter: "blur(8px)",
  WebkitBackdropFilter: "blur(8px)",
};

const modalCardStyle = {
  width: "100%",
  maxWidth: 460,
  background: "rgba(12, 18, 34, 0.96)",
  border: "1px solid rgba(255,255,255,0.11)",
  borderRadius: 22,
  padding: "26px 28px",
  boxShadow: "0 24px 60px rgba(0,0,0,0.50), inset 0 1px 0 rgba(255,255,255,0.06)",
  animation: "fadeIn 0.25s ease",
};

const toastContainerStyle = {
  position: "fixed",
  top: 20,
  right: 20,
  zIndex: 200,
  display: "flex",
  flexDirection: "column",
  gap: 10,
  pointerEvents: "none",
};

function getToastStyle(type) {
  const base = {
    padding: "14px 18px",
    borderRadius: 14,
    fontSize: 14,
    fontWeight: 600,
    maxWidth: 340,
    animation: "slideInRight 0.3s ease",
    backdropFilter: "blur(14px)",
    WebkitBackdropFilter: "blur(14px)",
    boxShadow: "0 10px 28px rgba(0,0,0,0.35)",
    fontFamily: "'Inter', Arial, sans-serif",
  };
  if (type === "error")
    return {
      ...base,
      background: "rgba(100,20,20,0.95)",
      border: "1px solid rgba(248,113,113,0.32)",
      color: "#fecaca",
    };
  if (type === "info")
    return {
      ...base,
      background: "rgba(23,46,113,0.95)",
      border: "1px solid rgba(96,165,250,0.32)",
      color: "#bfdbfe",
    };
  return {
    ...base,
    background: "rgba(15,64,35,0.95)",
    border: "1px solid rgba(74,222,128,0.32)",
    color: "#bbf7d0",
  };
}

function getRoleBadgeStyle() {
  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "6px 12px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: 0.8,
    background: "rgba(220,38,38,0.18)",
    color: "#fecaca",
    border: "1px solid rgba(248,113,113,0.24)",
  };
}

function getStatusBadgeStyle(status) {
  const base = {
    display: "inline-block",
    padding: "5px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 0.2,
  };
  if (status === "Onaylandı")
    return { ...base, background: "rgba(20,83,45,0.8)", color: "#bbf7d0", border: "1px solid rgba(74,222,128,0.2)" };
  if (status === "Reddedildi")
    return { ...base, background: "rgba(127,29,29,0.8)", color: "#fecaca", border: "1px solid rgba(248,113,113,0.2)" };
  return { ...base, background: "rgba(92,46,8,0.8)", color: "#fde68a", border: "1px solid rgba(251,191,36,0.2)" };
}
