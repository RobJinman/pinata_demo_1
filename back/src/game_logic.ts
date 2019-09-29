import { PlayerAction, ActionType, MoveAction } from "./common/action";
import { EntityManager } from "./common/entity_manager";
import { ComponentType } from "./common/component_types";
import { SpatialSystem } from "./common/spatial_system";
import { PhysicsSystem } from "./common/physics_system";

export class GameLogic {
  private _entityManager: EntityManager;
  private _queuedAction: PlayerAction|null = null;

  constructor(entityManager: EntityManager) {
    this._entityManager = entityManager;
  }

  update(actions: PlayerAction[]) {
    if (this._queuedAction) {
      if (this._handlePlayerAction(this._queuedAction)) {
        this._queuedAction = null;
      }
    }

    actions.forEach(action => {
      if (!this._handlePlayerAction(action)) {
        this._queuedAction = action;
      }
    });
  }

  private _movePlayer(action: MoveAction): boolean {
    const physicsSys = <PhysicsSystem>this._entityManager
                                          .getSystem(ComponentType.PHYSICS);
    const spatialSys = <SpatialSystem>this._entityManager
                                          .getSystem(ComponentType.SPATIAL);

    if (spatialSys.entityIsMoving(action.playerId)) {
      this._queuedAction = action;
      return false;
    }
    else {
      physicsSys.moveEntity(action.playerId, action.direction);
      return true;
    }
  }

  private _handlePlayerAction(action: PlayerAction): boolean {
    console.log("Game logic: Handling player action");

    switch (action.type) {
      case ActionType.MOVE: {
        return this._movePlayer(<MoveAction>action);
      }
    }

    return false;
  }
}
