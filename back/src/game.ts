import WebSocket from "ws";
import _ from "underscore";
import { PlayerAction } from "./common/action";
import { constructSoil, constructRock, constructGem,
         constructPlayer } from "./factory";
import { EntityManager, EntityId } from "./common/entity_manager";
import { SpatialSystem } from "./common/spatial_system";
import { AgentSystem } from "./common/agent_system";
import { ComponentType } from "./common/component_types";
import { Pipe } from "./pipe";
import { GameResponseType, RGameState, RNewEntities,
         REntitiesDeleted } from "./common/response";
import { GameLogic } from "./game_logic";
import { WORLD_W, WORLD_H, BLOCK_SZ, SERVER_FRAME_DURATION_MS, 
         SERVER_FRAME_RATE} from "./common/config";
import { EntityType } from "./common/game_objects";

function noThrow(fn: () => any) {
  try {
    return fn();
  }
  catch (err) {
    console.error("Error! " + err);
  }
}

export class Game {
  private static nextGameId: number = 0;

  private _id: number;
  private _pipe: Pipe;
  private _em: EntityManager;
  private _loopTimeout: NodeJS.Timeout;
  private _actionQueue: PlayerAction[] = [];
  private _gameLogic: GameLogic;
  private _frame: number = 0;

  constructor() {
    this._id = Game.nextGameId++;
    this._pipe = new Pipe();
    this._em = new EntityManager();

    const spatialSystem = new SpatialSystem(this._em,
                                            WORLD_W,
                                            WORLD_H,
                                            SERVER_FRAME_RATE);
    const agentSystem = new AgentSystem();

    this._em.addSystem(ComponentType.SPATIAL, spatialSystem);
    this._em.addSystem(ComponentType.AGENT, agentSystem);

    this._gameLogic = new GameLogic(this._em);

    console.log(`Starting game ${this._id}`);

    this._populate();

    this._loopTimeout = setInterval(() => noThrow(this._tick.bind(this)),
                                    SERVER_FRAME_DURATION_MS);
  }

  private _tick() {
    this._gameLogic.update(this._actionQueue);
    this._actionQueue = [];

    this._em.update();
    const dirties = this._em.getDirties();

    if (dirties.length > 0) {
      const response: RGameState = {
        type: GameResponseType.GAME_STATE,
        packets: dirties,
        frameNumber: this._frame
      };

      this._pipe.sendToAll(response);
    }

    this._frame++;
  }

  private _populate() {
    const spatialSys = <SpatialSystem>this._em.getSystem(ComponentType.SPATIAL);

    const numRocks = 5;
    const numGems = 5;

    let coords: [number, number][] = [];
    for (let c = 0; c < WORLD_W; ++c) {
      for (let r = 0; r < WORLD_H; ++r) {
        coords.push([c * BLOCK_SZ, r * BLOCK_SZ]);
      }
    }

    coords = _.shuffle(coords);

    let idx = 0;
    const rockCoords = coords.slice(0, numRocks);
    idx += numRocks;
    const gemCoords = coords.slice(idx, idx + numGems);
    idx += numGems;
    const soilCoords = coords.slice(idx);

    rockCoords.forEach(([c, r]) => {
      const id = constructRock(this._em);
      spatialSys.positionEntity(id, c, r);
    });

    gemCoords.forEach(([c, r]) => {
      const id = constructGem(this._em);
      spatialSys.positionEntity(id, c, r);
    });

    soilCoords.forEach(([c, r]) => {
      const id = constructSoil(this._em);
      spatialSys.positionEntity(id, c, r);
    });
  }

  addPlayer(socket: WebSocket, pinataId: string, pinataToken: string) {
    const entities = this._em.entities();
  
    const id = constructPlayer(this._em, pinataId, pinataToken);

    console.log(`Adding player ${id}`);
  
    this._pipe.addSocket(id, socket);

    const newEntitiesResp: RNewEntities = {
      type: GameResponseType.NEW_ENTITIES,
      entities: entities
    };

    const stateUpdateResp: RGameState = {
      type: GameResponseType.GAME_STATE,
      packets: this._em.getState(),
      frameNumber: this._frame
    }

    const newPlayerResp: RNewEntities = {
      type: GameResponseType.NEW_ENTITIES,
      entities: [{
        id,
        type: EntityType.PLAYER
      }]
    };

    this._pipe.send(id, newEntitiesResp);
    this._pipe.sendToAll(newPlayerResp);
    this._pipe.send(id, stateUpdateResp);

    return id;
  }

  removePlayer(id: EntityId) {
    console.log(`Removing player ${id}`);
    this._em.removeEntity(id);
    this._pipe.removeSocket(id);

    const response: REntitiesDeleted = {
      type: GameResponseType.ENTITIES_DELETED,
      entities: [{
        id,
        type: EntityType.PLAYER
      }]
    };

    this._pipe.sendToAll(response);
  }

  get numPlayers() {
    return this._em.getSystem(ComponentType.AGENT).numComponents();
  }

  get id() {
    return this._id;
  }

  onPlayerAction(action: PlayerAction) {
    console.log(`Received ${action.type} action from player ` +
                `${action.playerId}`);

    this._actionQueue.push(action);
  }

  terminate() {
    console.log(`Terminating game ${this._id}`);
    clearInterval(this._loopTimeout);
  }
}
