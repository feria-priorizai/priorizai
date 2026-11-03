import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AnchorHTMLAttributes } from "react";
import { describe, expect, it, vi } from "vitest";
import ColaInterconsultas from "@/components/interconsultas/ColaInterconsultas";
import type { VistaLista } from "@/utils/ordenLista";
import { crearInterconsulta } from "./fabricas";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
// Fuera del router de Next el enlace es un <a> común; aquí solo importa el foco.
vi.mock("next/link", () => ({
  default: ({ href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props} />
  ),
}));

const interconsultas = [
  crearInterconsulta({ id: "aaaaaaaa-1", prioridadActual: "alta", diagnostico: "Angina inestable" }),
  crearInterconsulta({ id: "bbbbbbbb-2", prioridadActual: "media", diagnostico: "Soplo sistólico" }),
  crearInterconsulta({ id: "cccccccc-3", prioridadActual: "baja", diagnostico: "Control de presión" }),
];

function renderizar(vista: VistaLista = "tarjetas", modoDescargaMultiple = false) {
  const usuario = userEvent.setup();
  render(
    <>
      <button type="button">Antes de la lista</button>
      <ColaInterconsultas
        interconsultas={interconsultas}
        vista={vista}
        modoDescargaMultiple={modoDescargaMultiple}
        onCambiarSeleccion={vi.fn()}
        mostrarBotonDescargaMultiple={false}
      />
      <button type="button">Después de la lista</button>
    </>,
  );
  return { usuario };
}

const folio = (id: string) =>
  screen.getByRole("link", { name: id.slice(0, 8).toUpperCase() });

describe.each<VistaLista>(["tarjetas", "tabla"])("ColaInterconsultas con teclado, vista %s (HDU-20)", (vista) => {
  it("la lista es una sola parada del tabulador", async () => {
    const { usuario } = renderizar(vista);
    screen.getByRole("button", { name: "Antes de la lista" }).focus();
    // La tabla tiene antes los encabezados ordenables.
    const saltos = vista === "tabla" ? 11 : 1;

    for (let i = 0; i < saltos; i++) await usuario.tab();
    expect(folio("aaaaaaaa-1")).toHaveFocus();
    await usuario.tab();
    expect(screen.getByRole("button", { name: "Después de la lista" })).toHaveFocus();
  });

  it("las flechas, Inicio y Fin mueven el foco entre interconsultas", async () => {
    const { usuario } = renderizar(vista);
    folio("aaaaaaaa-1").focus();

    await usuario.keyboard("{ArrowDown}");
    expect(folio("bbbbbbbb-2")).toHaveFocus();
    await usuario.keyboard("{End}");
    expect(folio("cccccccc-3")).toHaveFocus();
    await usuario.keyboard("{ArrowDown}");
    expect(folio("cccccccc-3")).toHaveFocus();
    await usuario.keyboard("{ArrowUp}");
    expect(folio("bbbbbbbb-2")).toHaveFocus();
    await usuario.keyboard("{Home}");
    expect(folio("aaaaaaaa-1")).toHaveFocus();
  });

  it("al volver con el tabulador entra por la última interconsulta visitada", async () => {
    const { usuario } = renderizar(vista);
    folio("aaaaaaaa-1").focus();
    await usuario.keyboard("{ArrowDown}");

    await usuario.tab();
    await usuario.tab({ shift: true });

    expect(folio("bbbbbbbb-2")).toHaveFocus();
    expect(folio("aaaaaaaa-1")).toHaveAttribute("tabindex", "-1");
  });

  it("el foco en la fila apunta al detalle de esa interconsulta", async () => {
    const { usuario } = renderizar(vista);
    folio("aaaaaaaa-1").focus();
    await usuario.keyboard("{ArrowDown}");

    // Enter sobre un enlace navega por el navegador; basta con que apunte bien.
    expect(document.activeElement).toHaveAttribute("href", "/interconsultas/bbbbbbbb-2");
  });
});

describe("ColaInterconsultas en modo descarga con teclado (HDU-20)", () => {
  it("desde una casilla, las flechas pasan a la casilla de la otra fila", async () => {
    const { usuario } = renderizar("tarjetas", true);
    const filas = screen.getAllByTestId("fila-interconsulta");
    within(filas[0]).getByRole("checkbox").focus();

    await usuario.keyboard("{ArrowDown}");

    expect(within(filas[1]).getByRole("checkbox")).toHaveFocus();
  });
});

describe("ColaInterconsultas con el filtro de atrasadas (HDU-22)", () => {
  const atrasadas = [
    crearInterconsulta({ id: "dddddddd-4", prioridadActual: "baja", atrasada: true, diasAtraso: 12 }),
    crearInterconsulta({ id: "eeeeeeee-5", prioridadActual: "alta", atrasada: true, diasAtraso: 3 }),
  ];

  it("muestra un solo grupo en el orden recibido, con la prioridad de cada ficha", () => {
    render(<ColaInterconsultas interconsultas={atrasadas} ordenPorAtraso />);

    expect(screen.getByRole("heading", { name: "Atrasadas" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Alta" })).not.toBeInTheDocument();
    const filas = screen.getAllByTestId("fila-interconsulta");
    expect(filas.map((f) => f.dataset.id)).toEqual(["dddddddd-4", "eeeeeeee-5"]);
    expect(within(filas[0]).getByText("Baja")).toBeInTheDocument();
    expect(within(filas[0]).getByTestId("atrasada")).toHaveTextContent("+12 d");
    expect(screen.getByText(/de mayor a menor atraso/)).toBeInTheDocument();
  });

  it("sin el filtro agrupa por prioridad y marca igual las atrasadas", () => {
    render(<ColaInterconsultas interconsultas={atrasadas} />);

    const filas = screen.getAllByTestId("fila-interconsulta");
    expect(filas.map((f) => f.dataset.id)).toEqual(["eeeeeeee-5", "dddddddd-4"]);
    expect(screen.getAllByTestId("atrasada")).toHaveLength(2);
  });

  it("en la tabla muestra el atraso en su propia columna", () => {
    render(<ColaInterconsultas interconsultas={[...atrasadas, interconsultas[0]]} vista="tabla" />);

    expect(screen.getByRole("button", { name: /Atraso/ })).toBeInTheDocument();
    expect(screen.getAllByTestId("atrasada")).toHaveLength(2);
  });

  it("sin atrasadas muestra el mensaje de lista vacía", () => {
    render(
      <ColaInterconsultas interconsultas={[]} ordenPorAtraso mensajeVacio="Nada atrasado" />,
    );

    expect(screen.getByText("Nada atrasado")).toBeInTheDocument();
  });
});
