import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import BadgeBanderaRoja from "@/components/ui/BadgeBanderaRoja";
import BadgeEstado from "@/components/ui/BadgeEstado";
import BadgePrioridad from "@/components/ui/BadgePrioridad";
import EstadoVista from "@/components/ui/EstadoVista";
import TarjetaEstadistica from "@/components/ui/TarjetaEstadistica";

describe("insignias", () => {
  it.each([
    ["alta", "Alta"],
    ["media", "Media"],
    ["baja", "Baja"],
  ] as const)("muestra la prioridad %s con su color", (prioridad, texto) => {
    render(<BadgePrioridad prioridad={prioridad} />);
    expect(screen.getByText(texto)).toHaveClass(`pz-chip--${prioridad}`);
  });

  it("distingue las interconsultas revisadas de las pendientes", () => {
    render(
      <>
        <BadgeEstado estado="revisada" />
        <BadgeEstado estado="pendiente" />
      </>,
    );
    expect(screen.getByText("Revisada")).toHaveClass("pz-chip--baja");
    expect(screen.getByText("Pendiente")).toHaveClass("pz-chip--neutral");
  });

  it("lista los términos que activaron la bandera roja", () => {
    render(<BadgeBanderaRoja terminos={["Dolor torácico", "Disnea"]} />);
    expect(screen.getByText("Dolor torácico, Disnea")).toBeInTheDocument();
    expect(screen.getByTitle("Bandera roja: Dolor torácico, Disnea")).toBeInTheDocument();
  });

  it("muestra una bandera roja genérica sin términos", () => {
    render(<BadgeBanderaRoja terminos={[]} />);
    expect(screen.getByTitle("Bandera roja detectada")).toBeInTheDocument();
  });
});

describe("EstadoVista", () => {
  it("anuncia los errores de inmediato", () => {
    render(<EstadoVista tipo="error" texto="No se pudo cargar" />);
    expect(screen.getByRole("alert")).toHaveAttribute("aria-live", "assertive");
    expect(screen.getByText("Error")).toBeInTheDocument();
  });

  it("anuncia la carga sin interrumpir", () => {
    render(<EstadoVista tipo="cargando" texto="Cargando interconsultas…" />);
    expect(screen.getByRole("status")).toHaveTextContent("Cargando interconsultas…");
  });
});

describe("TarjetaEstadistica", () => {
  it("muestra el título y la cifra con el color de acento", () => {
    render(<TarjetaEstadistica titulo="Alta prioridad" valor={12} icono={<svg />} acento="red" />);
    expect(screen.getByText("Alta prioridad")).toBeInTheDocument();
    expect(screen.getByText("12")).toHaveStyle({ color: "rgb(255, 0, 0)" });
  });
});
