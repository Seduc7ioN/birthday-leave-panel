import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import bg from "./assets/bg.png.png";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saveMessage, setSaveMessage] = useState("");

  const [authForm, setAuthForm] = useState({
    email: "",
    password: "",
    full_name: "",
  });

  const [form, setForm] = useState({
    employee_id: "",
    leave_type: "Tam Gün İzin",
    start_date: "",
    end_date: "",
    note: "",
    status: "Bekliyor",
  });

  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  useEffect(() => {
    injectGlobalStyles();

    supabase.auth.getSession().then(async ({ data }) => {
      const currentSession = data.session || null;
      setSession(currentSession);

      if (currentSession) {
        await ensureProfile(currentSession.user);
        await loadAll(currentSession.user.id);
      } else {
        setLoading(false);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      async (_event, currentSession) => {
        setSession(currentSession || null);

        if (currentSession) {
          await ensureProfile(currentSession.user);
          await loadAll(currentSession.user.id);
        } else {
          setProfile(null);
          setEmployees([]);
          setLeaveRequests([]);
          setLoading(false);
        }
      }
    );

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  async function ensureProfile(user) {
    const { data: existing } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (!existing) {
      await supabase.from("profiles").insert({
        id: user.id,
        email: user.email,
        full_name: user.user_metadata?.full_name || user.email,
        role: "viewer",
      });
    }

    const { data: fresh } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    setProfile(fresh || null);
  }

  async function loadAll(userId) {
    setLoading(true);

    const [{ data: p }, { data: e }, { data: l }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).single(),
      supabase.from("employees").select("*").order("full_name", { ascending: true }),
      supabase
        .from("leave_requests")
        .select("*, employees(full_name)")
        .order("start_date", { ascending: false }),
    ]);

    setProfile(p || null);
    setEmployees(e || []);
    setLeaveRequests(l || []);
    setLoading(false);
  }

  async function signUp() {
    const { email, password, full_name } = authForm;

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name },
      },
    });

    if (error) {
      alert(error.message);
      return;
    }

    alert("Kayıt tamam. Mail doğrulama açıksa mailini kontrol et.");
  }

  async function signIn() {
    const { email, password } = authForm;
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      alert(error.message);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

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

    if (error) {
      setSaveMessage("Kayıt hatası: " + error.message);
      return;
    }

    setSaveMessage("İzin kaydı eklendi.");
    setForm({
      employee_id: "",
      leave_type: "Tam Gün İzin",
      start_date: "",
      end_date: "",
      note: "",
      status: "Bekliyor",
    });

    if (session?.user?.id) {
      await loadAll(session.user.id);
    }
  }

  async function updateStatus(id, newStatus) {
    const { error } = await supabase
      .from("leave_requests")
      .update({ status: newStatus })
      .eq("id", id);

    if (error) {
      alert(error.message);
      return;
    }

    if (session?.user?.id) {
      await loadAll(session.user.id);
    }
  }

  async function deleteLeave(id) {
    if (!window.confirm("Bu kayıt silinsin mi?")) return;

    const { error } = await supabase
      .from("leave_requests")
      .delete()
      .eq("id", id);

    if (error) {
      alert(error.message);
      return;
    }

    if (session?.user?.id) {
      await loadAll(session.user.id);
    }
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
        !q ||
        person.includes(q) ||
        note.includes(q) ||
        item.leave_type?.toLowerCase().includes(q);

      const matchesStatus = !statusFilter || item.status === statusFilter;
      const matchesType = !typeFilter || item.leave_type === typeFilter;

      return matchesSearch && matchesStatus && matchesType;
    });
  }, [leaveRequests, searchText, statusFilter, typeFilter]);

  const canManage = profile?.role === "admin" || profile?.role === "manager";
  const canDelete = profile?.role === "admin";

  if (!session) {
    return (
      <div style={pageStyle}>
        <div style={overlayStyle} />
        <div style={contentWrapStyle}>
          <div style={{ maxWidth: 500, margin: "40px auto", ...sectionStyle }}>
            <div style={{ marginBottom: 18 }}>
              <div style={headerTopLineStyle}>Personel Yönetim Paneli</div>
              <h1 style={{ margin: 0, fontSize: 34 }}>Giriş / Kayıt</h1>
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
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <div style={overlayStyle} />

      <div style={contentWrapStyle}>
        <header style={headerStyle}>
          <div style={headerLeftStyle}>
            <div style={logoBoxStyle}>
              <span style={{ fontSize: 28 }}>🎉</span>
            </div>

            <div>
              <div style={headerTopLineStyle}>Personel Yönetim Paneli</div>
              <h1 style={headerTitleStyle}>Doğum Günü + İzin Takip Sistemi</h1>
              <div style={headerMetaRowStyle}>
                <span style={metaBadgeStyle}>
                  👤 {profile?.full_name || profile?.email || "Kullanıcı"}
                </span>
                <span style={getRoleBadgeStyle(profile?.role)}>
                  {profile?.role ? profile.role.toUpperCase() : "ROL YOK"}
                </span>
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

            <button onClick={signOut} style={logoutButtonStyle}>
              Çıkış
            </button>
          </div>
        </header>

        <div style={kpiGridStyle}>
          <Card title="👥 Personel" value={employees.length} />
          <Card title="🎂 Bugün" value={birthdayStats.today.length} />
          <Card title="📆 Bu Hafta" value={birthdayStats.thisWeek.length} />
          <Card title="⏭️ Gelecek Hafta" value={birthdayStats.nextWeek.length} />
          <Card title="📝 Bekleyen İzin" value={pendingCount} />
          <Card title="🏖️ Bugün İzinli" value={todayOnLeaveCount} />
        </div>

        <div style={twoColGridStyle}>
          <Section title={`🎂 Bugün Doğanlar (${birthdayStats.today.length})`}>
            <BirthdayList items={birthdayStats.today} emptyText="Bugün doğum günü yok" />
          </Section>

          <Section title={`📆 Bu Hafta (${birthdayStats.thisWeek.length})`}>
            <BirthdayList items={birthdayStats.thisWeek} emptyText="Bu hafta doğum günü yok" />
          </Section>

          <Section title={`⏭️ Gelecek Hafta (${birthdayStats.nextWeek.length})`}>
            <BirthdayList items={birthdayStats.nextWeek} emptyText="Gelecek hafta doğum günü yok" />
          </Section>

          <Section title={`🗓️ Bu Ay (${birthdayStats.thisMonth.length})`}>
            <BirthdayList items={birthdayStats.thisMonth} emptyText="Bu ay doğum günü yok" />
          </Section>

          <Section title={`📅 Gelecek Ay (${birthdayStats.nextMonth.length})`}>
            <BirthdayList items={birthdayStats.nextMonth} emptyText="Gelecek ay doğum günü yok" />
          </Section>

          <Section title={`🔔 Yaklaşanlar (${birthdayStats.upcoming.length})`}>
            <BirthdayList
              items={birthdayStats.upcoming}
              emptyText="Yaklaşan doğum günü yok"
              showUpcoming
            />
          </Section>
        </div>

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

            {saveMessage && <p style={{ margin: 0 }}>{saveMessage}</p>}
          </form>
        </Section>

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

          {loading ? (
            <p>Yükleniyor...</p>
          ) : filteredLeaveRequests.length === 0 ? (
            <p>Kayıt bulunamadı</p>
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
                      <th style={thStyle}>Durum</th>
                      <th style={thStyle}>Not</th>
                      <th style={thStyle}>İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLeaveRequests.map((item) => (
                      <tr key={item.id}>
                        <td style={tdStyle}>{item.employees?.full_name || "-"}</td>
                        <td style={tdStyle}>{item.leave_type}</td>
                        <td style={tdStyle}>{formatDateTR(item.start_date)}</td>
                        <td style={tdStyle}>{formatDateTR(item.end_date)}</td>
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
                              </>
                            )}

                            {canDelete && (
                              <button
                                onClick={() => deleteLeave(item.id)}
                                style={{ ...smallButtonStyle, background: "#7f1d1d" }}
                              >
                                Sil
                              </button>
                            )}

                            {!canManage && !canDelete && <span>-</span>}
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
                      <span style={mobileLabelStyle}>Durum</span>
                      <span style={getStatusBadgeStyle(item.status)}>{item.status}</span>
                    </div>
                    <div style={mobileRowStyle}>
                      <span style={mobileLabelStyle}>Not</span>
                      <span>{item.note || "-"}</span>
                    </div>

                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
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
                        </>
                      )}
                      {canDelete && (
                        <button
                          onClick={() => deleteLeave(item.id)}
                          style={{ ...smallButtonStyle, background: "#7f1d1d" }}
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
    </div>
  );
}

function BirthdayList({ items, emptyText, showUpcoming = false }) {
  if (!items.length) return <p>{emptyText}</p>;

  return items.map((item) => (
    <div key={item.id} style={listItemStyle}>
      <div style={{ fontWeight: "bold", marginBottom: 6 }}>{item.full_name}</div>
      <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 8 }}>
        {showUpcoming
          ? `${formatBirthday(item.birth_date)} • ${item.daysLeft} gün kaldı`
          : formatBirthday(item.birth_date)}
      </div>

      <button
        onClick={() => openBirthdayWhatsApp(item.full_name)}
        style={{
          ...smallButtonStyle,
          background: "#16a34a",
        }}
      >
        WhatsApp Mesajı
      </button>
    </div>
  ));
}

function Card({ title, value }) {
  return (
    <div style={cardStyle}>
      <div style={{ fontSize: 15, opacity: 0.9 }}>{title}</div>
      <div style={{ fontSize: 32, fontWeight: "bold", marginTop: 10 }}>{value}</div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={sectionStyle}>
      <h2 style={{ marginTop: 0 }}>{title}</h2>
      {children}
    </div>
  );
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
  return d.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit" });
}

function formatDateTR(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("tr-TR");
}

function openBirthdayWhatsApp(personName) {
  const text = `İyi ki doğdun ${personName}! Sağlık, mutluluk ve başarı dolu nice güzel yaşların olsun 🎉🎂`;
  const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank");
}

function getStatusBadgeStyle(status) {
  const base = {
    display: "inline-block",
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: "bold",
  };

  if (status === "Onaylandı") {
    return { ...base, background: "#14532d", color: "#bbf7d0" };
  }

  if (status === "Reddedildi") {
    return { ...base, background: "#7f1d1d", color: "#fecaca" };
  }

  return { ...base, background: "#78350f", color: "#fde68a" };
}

function getRoleBadgeStyle(role) {
  const base = {
    display: "inline-flex",
    alignItems: "center",
    padding: "8px 12px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: 0.4,
    border: "1px solid transparent",
  };

  if (role === "admin") {
    return {
      ...base,
      background: "rgba(220,38,38,0.18)",
      color: "#fecaca",
      border: "1px solid rgba(248,113,113,0.28)",
    };
  }

  if (role === "manager") {
    return {
      ...base,
      background: "rgba(37,99,235,0.18)",
      color: "#bfdbfe",
      border: "1px solid rgba(96,165,250,0.28)",
    };
  }

  return {
    ...base,
    background: "rgba(245,158,11,0.18)",
    color: "#fde68a",
    border: "1px solid rgba(251,191,36,0.28)",
  };
}

function injectGlobalStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById("custom-fade-style")) return;

  const style = document.createElement("style");
  style.id = "custom-fade-style";
  style.innerHTML = `
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }

    body {
      margin: 0;
      background: #05070d;
    }

    * {
      box-sizing: border-box;
    }

    button:hover {
      transform: translateY(-1px);
      filter: brightness(1.04);
    }

    input::placeholder,
    textarea::placeholder {
      color: rgba(255,255,255,0.45);
    }

    .mobile-cards {
      display: none;
    }

    @media (max-width: 768px) {
      .desktop-table {
        display: none;
      }

      .mobile-cards {
        display: block;
      }
    }
  `;
  document.head.appendChild(style);
}

const pageStyle = {
  minHeight: "100vh",
  padding: 24,
  fontFamily: "Arial, sans-serif",
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
  background: `
    linear-gradient(
      135deg,
      rgba(3, 7, 18, 0.82) 0%,
      rgba(10, 15, 28, 0.74) 35%,
      rgba(17, 24, 39, 0.70) 65%,
      rgba(2, 6, 23, 0.82) 100%
    )
  `,
  backdropFilter: "blur(8px)",
  WebkitBackdropFilter: "blur(8px)",
  zIndex: 0,
};

const contentWrapStyle = {
  position: "relative",
  zIndex: 1,
  animation: "fadeIn 0.6s ease",
};

const kpiGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 16,
  marginBottom: 24,
};

const twoColGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: 16,
  marginBottom: 24,
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
  marginBottom: 16,
};

const cardStyle = {
  background: "rgba(17, 25, 40, 0.48)",
  padding: 20,
  borderRadius: 20,
  border: "1px solid rgba(255,255,255,0.10)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  boxShadow: "0 14px 34px rgba(0,0,0,0.22)",
  transition: "transform 0.25s ease, box-shadow 0.25s ease",
};

const sectionStyle = {
  background: "rgba(17, 25, 40, 0.50)",
  padding: 22,
  borderRadius: 20,
  marginBottom: 20,
  border: "1px solid rgba(255,255,255,0.10)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  boxShadow: "0 14px 34px rgba(0,0,0,0.22)",
};

const inputStyle = {
  width: "100%",
  padding: 13,
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(8,12,22,0.78)",
  color: "white",
  fontSize: 15,
  boxSizing: "border-box",
  outline: "none",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
};

const buttonStyle = {
  padding: 13,
  border: "none",
  borderRadius: 12,
  background: "linear-gradient(135deg, #2563eb, #3b82f6)",
  color: "white",
  fontWeight: "bold",
  cursor: "pointer",
  boxShadow: "0 10px 24px rgba(37,99,235,0.34)",
  transition: "transform 0.2s ease, box-shadow 0.2s ease",
};

const secondaryButtonStyle = {
  padding: 12,
  border: "1px solid rgba(255,255,255,0.10)",
  borderRadius: 12,
  background: "rgba(51,65,85,0.82)",
  color: "white",
  fontWeight: "bold",
  cursor: "pointer",
};

const smallButtonStyle = {
  padding: "8px 12px",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 10,
  background: "rgba(55,65,81,0.88)",
  color: "white",
  cursor: "pointer",
};

const listItemStyle = {
  padding: "10px 0",
  borderBottom: "1px solid #333",
};

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: 900,
};

const thStyle = {
  textAlign: "left",
  padding: 12,
  borderBottom: "1px solid #444",
  color: "#ddd",
  fontSize: 14,
};

const tdStyle = {
  padding: 12,
  borderBottom: "1px solid #333",
  verticalAlign: "top",
};

const mobileLeaveCardStyle = {
  padding: 14,
  borderRadius: 14,
  marginBottom: 12,
  background: "rgba(10,14,24,0.72)",
  border: "1px solid rgba(255,255,255,0.08)",
};

const mobileRowStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  marginBottom: 8,
  alignItems: "center",
};

const mobileLabelStyle = {
  color: "rgba(255,255,255,0.7)",
  fontSize: 13,
  minWidth: 80,
};

const headerStyle = {
  position: "relative",
  zIndex: 1,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 16,
  flexWrap: "wrap",
  padding: "22px 24px",
  marginBottom: 24,
  borderRadius: 22,
  background: "rgba(17, 25, 40, 0.52)",
  border: "1px solid rgba(255,255,255,0.12)",
  boxShadow: "0 16px 40px rgba(0,0,0,0.30)",
  backdropFilter: "blur(14px)",
  WebkitBackdropFilter: "blur(14px)",
};

const headerLeftStyle = {
  display: "flex",
  alignItems: "center",
  gap: 16,
  flexWrap: "wrap",
};

const logoBoxStyle = {
  width: 68,
  height: 68,
  borderRadius: 20,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "linear-gradient(135deg, rgba(37,99,235,0.95), rgba(59,130,246,0.68))",
  boxShadow: "0 10px 26px rgba(37,99,235,0.35)",
  flexShrink: 0,
  border: "1px solid rgba(255,255,255,0.14)",
};

const headerTopLineStyle = {
  fontSize: 12,
  letterSpacing: 1.2,
  textTransform: "uppercase",
  color: "rgba(255,255,255,0.72)",
  marginBottom: 4,
};

const headerTitleStyle = {
  margin: 0,
  fontSize: 34,
  lineHeight: 1.05,
  fontWeight: 800,
  color: "#fff",
  textShadow: "0 2px 14px rgba(0,0,0,0.35)",
};

const headerMetaRowStyle = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  marginTop: 10,
};

const metaBadgeStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "8px 12px",
  borderRadius: 999,
  background: "rgba(255,255,255,0.08)",
  color: "#fff",
  fontSize: 13,
  border: "1px solid rgba(255,255,255,0.08)",
};

const headerRightStyle = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
};

const headerInfoCardStyle = {
  padding: "10px 14px",
  borderRadius: 14,
  background: "rgba(255,255,255,0.07)",
  border: "1px solid rgba(255,255,255,0.08)",
  minWidth: 130,
};

const headerInfoLabelStyle = {
  fontSize: 12,
  color: "rgba(255,255,255,0.68)",
  marginBottom: 4,
};

const headerInfoValueStyle = {
  fontSize: 15,
  fontWeight: 700,
  color: "#fff",
};

const logoutButtonStyle = {
  padding: "12px 16px",
  border: "1px solid rgba(255,255,255,0.10)",
  borderRadius: 12,
  background: "linear-gradient(135deg, rgba(51,65,85,0.95), rgba(71,85,105,0.92))",
  color: "white",
  fontWeight: "bold",
  cursor: "pointer",
  boxShadow: "0 8px 20px rgba(0,0,0,0.22)",
};