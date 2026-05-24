import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import TallerAutos from "./TallerAutos";
import TallerMotos from "./TallerMotos";
import VNAutos from "./VNAutos";
import VNMotos from "./VNMotos";
import SimuladorHospital from "./SimuladorHospital";
import SimuladorEmbotelladora from "./SimuladorEmbotelladora";

const cardStyle = (bg) => ({
  display: "block",
  padding: "16px 20px",
  borderRadius: 14,
  textDecoration: "none",
  color: "#fff",
  fontSize: 15,
  fontWeight: 600,
  background: bg,
  marginBottom: 0,
});

const descStyle = {
  display: "block",
  fontSize: 11,
  fontWeight: 400,
  opacity: 0.8,
  marginTop: 3,
};

const sectionLabel = {
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: "2px",
  textTransform: "uppercase",
  color: "#9a9e98",
  margin: "20px 0 10px 2px",
};

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={
          <div style={{ minHeight: "100vh", background: "#f0efea", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI',system-ui,sans-serif" }}>
            <div style={{ maxWidth: 420, width: "100%", padding: 24 }}>

              {/* Header */}
              <div style={{ textAlign: "center", marginBottom: 28 }}>
                <h1 style={{ color: "#1a2a1e", fontSize: 24, fontWeight: 700, marginBottom: 4, letterSpacing: "-0.3px" }}>Simuladores Monte Carlo</h1>
                <p style={{ color: "#7a8a7e", fontSize: 13, margin: 0 }}>Promundial Consulting Group</p>
              </div>

              {/* Sector Automotriz */}
              <div style={sectionLabel}>Sector Automotriz</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <Link to="/taller-autos" style={cardStyle("linear-gradient(135deg,#2d6a4f,#1a3d2e)")}>
                  🔧 Taller de Autos
                  <span style={descStyle}>Servicios y repuestos · 3 cuellos de botella · Absorción</span>
                </Link>
                <Link to="/taller-motos" style={cardStyle("linear-gradient(135deg,#1d3f6e,#0f2440)")}>
                  🛠️ Taller de Motos
                  <span style={descStyle}>Servicios y repuestos motos · Defaults calibrados</span>
                </Link>
                <Link to="/vn-autos" style={cardStyle("linear-gradient(135deg,#3a5a2e,#1f3518)")}>
                  🚗 Venta Autos Nuevos
                  <span style={descStyle}>Funnel comercial · Inventario · Floor plan</span>
                </Link>
                <Link to="/vn-motos" style={cardStyle("linear-gradient(135deg,#b5832a,#7a5518)")}>
                  🏍️ Venta Motos Nuevas
                  <span style={descStyle}>Funnel comercial motos · Sin devoluciones</span>
                </Link>
              </div>

              {/* Sector Salud */}
              <div style={sectionLabel}>Sector Salud</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <Link to="/hospital" style={cardStyle("linear-gradient(135deg,#5c3a7a,#341f47)")}>
                  🏥 Hospital
                  <span style={descStyle}>Quirófanos · Emergencias · Imágenes · Laboratorio</span>
                </Link>
              </div>

              {/* Sector Bebidas */}
              <div style={sectionLabel}>Sector Bebidas</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <Link to="/embotelladora" style={cardStyle("linear-gradient(135deg,#1a6b6b,#0d3d3d)")}>
                  🥤 Embotelladora
                  <span style={descStyle}>Volumen · COGS · CAPEX · WACC flexible</span>
                </Link>
              </div>

              {/* Footer */}
              <div style={{ textAlign: "center", marginTop: 32, fontSize: 11, color: "#aab0aa" }}>
                © Promundial Consulting Group · IR y WACC flexibles por país e industria
              </div>

            </div>
          </div>
        } />
        <Route path="/taller-autos" element={<TallerAutos />} />
        <Route path="/taller-motos" element={<TallerMotos />} />
        <Route path="/vn-autos" element={<VNAutos />} />
        <Route path="/vn-motos" element={<VNMotos />} />
        <Route path="/hospital" element={<SimuladorHospital />} />
        <Route path="/embotelladora" element={<SimuladorEmbotelladora />} />
      </Routes>
    </BrowserRouter>
  );
}
