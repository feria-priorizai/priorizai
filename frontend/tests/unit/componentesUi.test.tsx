import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import BadgeAtrasada from "@/components/ui/BadgeAtrasada";
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

  it("marca la atrasada con un estilo distinto al de la bandera roja (HDU-22)", () => {
    render(<BadgeAtrasada dias={3} />);
    const marca = screen.getByTestId("atrasada");
    expect(marca).toHaveTextContent("Atrasada · +3 d");
    expect(marca).toHaveClass("pz-chip--atrasada");
    expect(marca).not.toHaveClass("pz-chip--flag");
    expect(marca).toHaveAttribute("title", "Atrasada: 3 días sobre el plazo de revisión");
  });

  it("en su versión compacta deja la descripción completa para el lector de pantalla", () => {
    render(<BadgeAtrasada dias={1} compacta />);
    expect(screen.getByTestId("atrasada")).toHaveTextContent("+1 d");
    expect(screen.getByText("Atrasada: 1 día sobre el plazo de revisión")).toHaveClass(
      "visually-hidden",
    );
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
