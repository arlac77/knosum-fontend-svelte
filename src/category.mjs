import { FetchCommand } from "svelte-command";
import { Category, Meter, Note } from "@konsumation/model";
import { api } from "./constants.mjs";
import { session, headers } from "./util.mjs";

export async function* categoryIterator(transition) {
  if (this.categories) {
    yield* this.categories;
  } else {
    const categories = [];

    //this.categories = categories;
    //transition.context.categories = categories;

    const response = await fetch(`${api}/category`, {
      headers: headers(session)
    });

    if (!response.ok) {
      throw response;
    }

    for (const c of await response.json()) {
      const category = new FronendCategory(c);
      categories.push(category);
      yield category;
    }
  }
}

export async function* valueIterator(transition) {
  const response = await fetch(
    `${api}/category/${transition.params.category}/value`,
    {
      headers: headers(session)
    }
  );

  if (!response.ok) {
    throw response;
  }

  for (const value of await response.json()) {
    yield value;
  }
}

export { Meter };
export { FrontendNote as Note };
export { FronendCategory as Category };

export class FrontendNote extends Note {
  constructor(category, json) {
    super(json);
    this.category = category;
  }
}

export class FronendCategory extends Category {

  latestSubscriptions = new Set();
  valuesSubscriptions = new Set();

  constructor(json = {}) {
    super(json);
    this.fractionalDigits = json.fractionalDigits || 2;
    this.order = json.order || 1.0;
  }

  get url() {
    return `${api}/category/${this.name}`;
  }

  async *meters() {
    const response = await fetch(`${this.url}/meters`, {
      headers: headers(session)
    });
    if (!response.ok) {
      throw response;
    }

    for (const item of await response.json()) {
      item.category = this;
      yield new Meter(item);
    }
  }

  async *notes() {
    const response = await fetch(`${this.url}/notes`, {
      headers: headers(session)
    });

    if (!response.ok) {
      throw response;
    }

    for (const item of await response.json()) {
      yield new FrontendNote(this, item);
    }
  }

  get deleteCommand() {
    return new FetchCommand(
      this.url,
      {
        method: "DELETE",
        headers: headers(session)
      },
      { title: "Delete", shortcuts: "alt+d" }
    );
  }

  get saveCommand() {
    return new FetchCommand(
      () => this.url,
      () => {
        return {
          method: "PUT",
          headers: headers(session),
          body: JSON.stringify({
            order: this.order,
            unit: this.unit,
            fractionalDigits: parseInt(this.fractionalDigits),
            description: this.description
          })
        };
      },
      { title: "Save", shortcuts: "alt+s" }
    );
  }

  async _latest() {
    const response = await fetch(`${this.url}/value?reverse=1&limit=1`, {
      headers: headers(session)
    });

    if (!response.ok) {
      throw response;
    }

    const entry = (await response.json())[0];
    this.latestSubscriptions.forEach(subscription => subscription(entry));
  }

  get latest() {
    return {
      subscribe: subscription => {
        this.latestSubscriptions.add(subscription);
        subscription(undefined);
        this._latest();
        return () => this.latestSubscriptions.delete(subscription);
      }
    };
  }

  async _values() {
    const response = await fetch(`${this.url}/value`, {
      headers: headers(session)
    });

    if (!response.ok) {
      throw response;
    }

    const values = await response.json();
    this.valuesSubscriptions.forEach(subscription => subscription(values));
  }

  get values() {
    return {
      subscribe: subscription => {
        this.valuesSubscriptions.add(subscription);
        subscription([]);
        this._values();
        return () => this.valuesSubscriptions.delete(subscription);
      }
    };
  }

  insertCommand(values) {
    return new FetchCommand(
      `${this.url}/value`,
      () => {
        const v = values();
        return {
          method: "POST",
          headers: headers(session),
          body: JSON.stringify({ value: v[0], time: v[1].getTime() })
        };
      },
      { title: `Insert ${this.name}` }
    );
  }

  /**
   * Delete one value from category.
   *
   * @param key database key which should be delete
   */
  deleteValueCommand(key, responseHandler) {
    return new FetchCommand(
      `${this.url}/value`,
      () => {
        return {
          method: "DELETE",
          headers: headers(session),
          body: JSON.stringify({ key: key })
        };
      },
      {
        title: "Delete",
        // TODO commands should act like promises
        responseHandler
      }
    );
  }
}
